/**
 * openeditor-text-angular — the official Angular wrapper (Phase 18.5).
 *
 * Standalone component implementing ControlValueAccessor, so it plugs into
 * both template-driven ([(ngModel)]) and reactive (formControl) forms.
 *
 * Same design contract as the React/Vue wrappers (editor README, Phase 18):
 * uncontrolled-by-default — writeValue() syncs only genuinely EXTERNAL
 * values (echoes of the editor's own onChange are diffed away, so typing
 * never re-enters setHTML and the caret never jumps). Reactive inputs are
 * ONLY theme/direction (+ disabled via the CVA); config/plugins are
 * construct-time. Zone-independent: events re-enter Angular via emitters.
 */
import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy,
  Output, ViewChild, forwardRef, OnChanges, SimpleChanges,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { OpenEditor } from 'openeditor-text';
import type { OpenEditorConfig, EditorPlugin } from 'openeditor-text';

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

  /** Construct-time editor config (recreate the component to change). */
  @Input() config: OpenEditorConfig | undefined;
  /** Construct-time plugin instances, installed on init. */
  @Input() plugins: EditorPlugin[] | undefined;
  /** Reactive. */
  @Input() theme: string | undefined;
  /** Reactive. */
  @Input() direction: 'ltr' | 'rtl' | undefined;
  /** Phase 2 — the license token. Reactive: changing it re-verifies in place
   *  (unlocks newly-granted premium without recreating the component). */
  @Input() licenseKey: string | null | undefined;
  /** Phase 2 — the integrator's published ES256 public key(s), embedded at build. */
  @Input() licenseKeys: Array<{ kid: string; jwk: JsonWebKey }> | null | undefined;

  @Output() ready = new EventEmitter<OpenEditor>();
  @Output() changed = new EventEmitter<{ html: string; text: string }>();
  @Output() focused = new EventEmitter<unknown>();
  @Output() blurred = new EventEmitter<unknown>();
  @Output() errored = new EventEmitter<{ error: Error; context?: string }>();
  /** Phase 2 — an invalid/failed license (bad key, wrong domain, expired). */
  @Output() licenseError = new EventEmitter<{ reason: string; message?: string }>();
  /** Phase 2 — premium finished (async) loading. */
  @Output() premiumReady = new EventEmitter<{ installed: string[] }>();

  /** The live core instance (null before init / after destroy). */
  editor: OpenEditor | null = null;

  private lastEmitted: string | null = null;
  private pendingValue: string | null = null;
  private pendingDisabled: boolean | null = null;
  private cvaOnChange: (html: string) => void = () => {};
  private cvaOnTouched: () => void = () => {};

  ngAfterViewInit(): void {
    const editor = new OpenEditor(this.host.nativeElement, {
      ...(this.config || {}),
      ...(this.theme !== undefined ? { theme: this.theme as OpenEditorConfig['theme'] } : {}),
      ...(this.direction !== undefined ? { direction: this.direction } : {}),
      ...(this.pendingValue !== null ? { defaultContent: this.pendingValue } : {}),
      // Phase 2 — present at construct so premium verifies + unlocks on init.
      ...(this.licenseKey !== undefined ? { licenseKey: this.licenseKey } : {}),
      ...(this.licenseKeys !== undefined ? { licenseKeys: this.licenseKeys } : {}),
    });
    this.editor = editor;
    this.lastEmitted = editor.getHTML();
    this.pendingValue = null;

    for (const plugin of this.plugins || []) editor.plugins.install(plugin);
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
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.editor) return;
    if (changes['theme'] && this.theme !== undefined) this.editor.setTheme(this.theme);
    if (changes['direction'] && this.direction !== undefined) this.editor.setDirection(this.direction);
    // Phase 2 — reactive licensing: re-verify in place on a change to EITHER
    // licenseKey OR licenseKeys (parity with React/Vue, which react to both).
    // Guard the FIRST change of each (the construct value is already applied).
    const keyChanged = changes['licenseKey'] && !changes['licenseKey'].isFirstChange();
    const keysChanged = changes['licenseKeys'] && !changes['licenseKeys'].isFirstChange();
    if (keyChanged || keysChanged) {
      this.editor.setLicenseKey(this.licenseKey ?? null, this.licenseKeys);
    }
  }

  ngOnDestroy(): void {
    if (this.editor && !this.editor.isDestroyed()) this.editor.destroy();
    this.editor = null;
  }

  // ── ControlValueAccessor ───────────────────────────────────────────────────
  writeValue(value: string | null): void {
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
