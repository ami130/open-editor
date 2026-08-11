/**
 * angular.ts — the delivery-aware Angular wrapper (execution plan §1.5 stage 4).
 *
 * Same contract as `openeditor-text-angular`: a standalone component
 * implementing ControlValueAccessor, so it plugs into both template-driven
 * ([(ngModel)]) and reactive (formControl) forms. One structural difference:
 *
 *     npm wrapper:      new OpenEditor(...)          synchronous
 *     delivery wrapper: await createEditor(...)      ASYNCHRONOUS
 *
 * ─── WHY THAT IS EASIER HERE THAN IN REACT/VUE ──────────────────────────────
 * The npm wrapper ALREADY buffers form state that arrives before the editor
 * exists — `pendingValue` and `pendingDisabled` cover the window between a
 * form binding firing and ngAfterViewInit. Angular's CVA guarantees nothing
 * about that ordering, so the buffer had to exist regardless.
 *
 * Under runtime delivery that window simply gets wider: it now lasts for the
 * whole engine download. The same buffer covers it, so a form value written
 * during the download is applied the moment the editor arrives rather than
 * being lost — which is the failure that would otherwise silently blank a
 * customer's form on slow connections.
 *
 * A destroy during the download is guarded explicitly: an editor that resolves
 * after ngOnDestroy is destroyed rather than attached to a dead view.
 */
import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy,
  Output, ViewChild, forwardRef, OnChanges, SimpleChanges,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type { OpenEditor, OpenEditorConfig, EditorPlugin } from 'openeditor-text';
// `./index.js` is plain JavaScript; `src/index.d.ts` sits beside it so
// TypeScript resolves real types here rather than making every callback below
// implicitly `any` under --strict.
import { createEditor, applyLicence } from './index.js';

@Component({
  selector: 'open-editor',
  standalone: true,
  template: '<div #host data-open-editor-host></div>',
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => OpenEditorComponent),
    multi: true,
  }],
})
export class OpenEditorComponent
implements AfterViewInit, OnDestroy, OnChanges, ControlValueAccessor {
  @ViewChild('host', { static: true }) private host!: ElementRef<HTMLElement>;

  // ── Delivery inputs ────────────────────────────────────────────────────────
  /** Delivery API origin. REQUIRED. */
  @Input() endpoint!: string;
  /** Licence key unlocking premium. Absent → the free tier. */
  @Input() licenceKey: string | null | undefined;
  /** Historical spelling, accepted as an alias. */
  @Input() licenseKey: string | null | undefined;
  /** Pin a specific engine version (a licence pin still wins). */
  @Input() version: string | undefined;
  /** Override the anonymous install id. Normally omitted. */
  @Input() installId: string | undefined;
  /** Cache the engine in IndexedDB. Default true. */
  @Input() cache: boolean | undefined;
  /** Degraded textarea on failure: false disables, a string overrides its text. */
  @Input() fallback: boolean | string | undefined;
  /** Which plugins to install. Default 'all'. */
  @Input() plugins: 'all' | EditorPlugin[] | undefined;

  // ── Editor inputs (unchanged from the npm wrapper) ─────────────────────────
  /** Construct-time editor config (recreate the component to change). */
  @Input() config: OpenEditorConfig | undefined;
  /** Reactive. */
  @Input() theme: string | undefined;
  /** Reactive. */
  @Input() direction: 'ltr' | 'rtl' | undefined;

  @Output() ready = new EventEmitter<OpenEditor>();
  @Output() changed = new EventEmitter<{ html: string; text: string }>();
  @Output() focused = new EventEmitter<unknown>();
  @Output() blurred = new EventEmitter<unknown>();
  @Output() errored = new EventEmitter<{ error: Error; context?: string }>();
  @Output() licenseError = new EventEmitter<{ reason: string; message?: string }>();
  @Output() premiumReady = new EventEmitter<{ installed: string[] }>();
  /** Delivery-only: the ENGINE could not be loaded at all. */
  @Output() loadError = new EventEmitter<Error>();
  /** Result of a reactive licenceKey change (E1) — carries `reloadRequired`. */
  @Output() licenceApplied = new EventEmitter<
  { applied: boolean; plan: string; reloadRequired: boolean }
  >();

  /** The live core instance — null while loading, and after destroy. */
  editor: OpenEditor | null = null;

  private lastEmitted: string | null = null;
  private pendingValue: string | null = null;
  private pendingDisabled: boolean | null = null;
  private destroyed = false;
  private cvaOnChange: (html: string) => void = () => {};
  private cvaOnTouched: () => void = () => {};

  ngAfterViewInit(): void {
    createEditor(this.host.nativeElement, {
      ...(this.config || {}),
      endpoint: this.endpoint,
      ...(this.licenceKey !== undefined ? { licenceKey: this.licenceKey } : {}),
      ...(this.licenseKey !== undefined ? { licenseKey: this.licenseKey } : {}),
      ...(this.version !== undefined ? { version: this.version } : {}),
      ...(this.installId !== undefined ? { installId: this.installId } : {}),
      ...(this.cache !== undefined ? { cache: this.cache } : {}),
      ...(this.fallback !== undefined ? { fallback: this.fallback } : {}),
      ...(this.plugins !== undefined ? { plugins: this.plugins } : {}),
      ...(this.theme !== undefined ? { theme: this.theme as OpenEditorConfig['theme'] } : {}),
      ...(this.direction !== undefined ? { direction: this.direction } : {}),
      ...(this.pendingValue !== null ? { defaultContent: this.pendingValue } : {}),
      // The loader logs otherwise; the host gets it via loadError below.
      onError: () => {},
    }).then((editor) => {
      // Destroyed while the engine was still downloading.
      if (this.destroyed) { editor.destroy?.(); return; }

      this.editor = editor;
      this.lastEmitted = editor.getHTML();

      // Anything the form wrote DURING the download is applied now. Without
      // this a value bound before the engine arrived would be silently lost —
      // the wider the download window, the more likely that becomes.
      if (this.pendingValue !== null && this.pendingValue !== this.lastEmitted) {
        editor.setHTML(this.pendingValue);
        this.lastEmitted = editor.getHTML();
      }
      this.pendingValue = null;
      if (this.pendingDisabled !== null) editor.setReadOnly(this.pendingDisabled);

      editor.on('onChange', (payload) => {
        const { html, text } = payload as { html: string; text: string };
        this.lastEmitted = html;
        this.cvaOnChange(html);
        this.changed.emit({ html, text });
      });
      editor.on('focus', (e) => this.focused.emit(e));
      editor.on('blur', (e) => { this.cvaOnTouched(); this.blurred.emit(e); });
      editor.on('error', (p) => this.errored.emit(p as { error: Error; context?: string }));
      editor.on('licenseError', (p) => this.licenseError.emit(p as { reason: string; message?: string }));
      editor.on('premiumReady', (p) => this.premiumReady.emit(p as { installed: string[] }));
      this.ready.emit(editor);
    }).catch((err: Error) => {
      if (this.destroyed) return;
      this.loadError.emit(err);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // No-ops until the engine arrives; the values are applied at construction,
    // so nothing is lost by waiting.
    if (!this.editor) return;
    if (changes['theme'] && this.theme !== undefined) this.editor.setTheme(this.theme);
    if (changes['direction'] && this.direction !== undefined) {
      this.editor.setDirection(this.direction);
    }

    /**
     * Reactive licence key (E1) — parity with the npm wrapper. Guarded on
     * isFirstChange because the construct value is already applied.
     *
     * Under delivery a PLAN change needs a different bundle, which must not be
     * swapped under a live document (§1.7 / R14), so the emitted result carries
     * `reloadRequired` and the host chooses the moment.
     */
    const keyChanged = changes['licenceKey'] && !changes['licenceKey'].isFirstChange();
    const aliasChanged = changes['licenseKey'] && !changes['licenseKey'].isFirstChange();
    if (keyChanged || aliasChanged) {
      applyLicence(this.editor, this.licenceKey ?? this.licenseKey ?? null, {
        endpoint: this.endpoint, version: this.version, installId: this.installId,
        container: this.host?.nativeElement,
      })
        .then((result) => this.licenceApplied.emit(result))
        .catch((err: Error) => this.loadError.emit(err));
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.editor && !this.editor.isDestroyed()) this.editor.destroy();
    this.editor = null;
  }

  // ── ControlValueAccessor ───────────────────────────────────────────────────
  writeValue(value: string | null): void {
    // Buffered while the engine downloads — see ngAfterViewInit.
    if (!this.editor) { this.pendingValue = value; return; }
    if (value === null || value === undefined) return;
    if (value === this.lastEmitted) return;            // our own echo
    if (value === this.editor.getHTML()) return;       // already in sync
    this.editor.setHTML(value);
    this.lastEmitted = this.editor.getHTML();
  }

  registerOnChange(fn: (html: string) => void): void { this.cvaOnChange = fn; }
  registerOnTouched(fn: () => void): void { this.cvaOnTouched = fn; }

  setDisabledState(isDisabled: boolean): void {
    if (!this.editor) { this.pendingDisabled = isDisabled; return; }
    this.editor.setReadOnly(isDisabled);
  }
}
