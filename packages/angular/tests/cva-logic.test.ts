/**
 * Angular wrapper — ControlValueAccessor logic (Phase 18.5).
 *
 * These exercise the component class directly against a mock core editor,
 * proving the contract the "live-proven" claim rested on but never automated:
 * echo-diffing (no caret-jump loop), pending-value buffering before init,
 * disabled → read-only, and event → output wiring. No TestBed / Angular
 * runtime — the AOT + real-browser drive is the Phase 18.5 consumer app.
 */
// The wrapper's dist is partial-Ivy (linker-processed for AOT consumers). Under
// vitest we import the SOURCE, so provide the JIT compiler + zone before Angular
// decorators evaluate — otherwise @Component throws "Linker has not processed".
import '@angular/compiler';
import 'zone.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenEditorComponent } from '../src/open-editor.component';

/** A minimal stand-in for the core OpenEditor with the surface the CVA uses. */
function mockEditor(initialHtml = '<p></p>') {
  let html = initialHtml;
  let readOnly = false;
  const handlers: Record<string, (p: unknown) => void> = {};
  return {
    _html: () => html,
    _readOnly: () => readOnly,
    _fire: (evt: string, p: unknown) => handlers[evt]?.(p),
    getHTML: () => html,
    setHTML: vi.fn((v: string) => { html = v; }),
    setReadOnly: vi.fn((v: boolean) => { readOnly = v; }),
    setTheme: vi.fn(),
    setDirection: vi.fn(),
    isDestroyed: () => false,
    destroy: vi.fn(),
    on: (evt: string, fn: (p: unknown) => void) => { handlers[evt] = fn; },
    plugins: { install: vi.fn() },
  };
}

/** Wire a component to a mock editor as if ngAfterViewInit had run. */
function wire(comp: OpenEditorComponent, ed: ReturnType<typeof mockEditor>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (comp as any).editor = ed;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (comp as any).lastEmitted = ed.getHTML();
  ed.on('onChange', (payload) => {
    const { html, text } = payload as { html: string; text: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (comp as any).lastEmitted = html;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (comp as any).cvaOnChange(html);
    comp.changed.emit({ html, text });
  });
  ed.on('blur', (e) => { comp.blurred.emit(e); });
}

let comp: OpenEditorComponent;
beforeEach(() => { comp = new OpenEditorComponent(); });

describe('writeValue — echo diffing (no caret-jump loop)', () => {
  it('applies a genuinely external value', () => {
    const ed = mockEditor('<p>old</p>'); wire(comp, ed);
    comp.writeValue('<p>new external</p>');
    expect(ed.setHTML).toHaveBeenCalledWith('<p>new external</p>');
    expect(ed._html()).toBe('<p>new external</p>');
  });

  it('ignores the echo of its own onChange (never re-enters setHTML)', () => {
    const ed = mockEditor('<p>start</p>'); wire(comp, ed);
    ed._fire('onChange', { html: '<p>typed</p>', text: 'typed' }); // user typed
    comp.writeValue('<p>typed</p>');                                // form feeds it back
    expect(ed.setHTML).not.toHaveBeenCalled();                      // no loop
  });

  it('ignores a value already equal to current HTML', () => {
    const ed = mockEditor('<p>same</p>'); wire(comp, ed);
    comp.writeValue('<p>same</p>');
    expect(ed.setHTML).not.toHaveBeenCalled();
  });

  it('ignores null / undefined', () => {
    const ed = mockEditor('<p>x</p>'); wire(comp, ed);
    comp.writeValue(null);
    comp.writeValue(undefined as unknown as string);
    expect(ed.setHTML).not.toHaveBeenCalled();
  });
});

describe('buffering before the editor exists', () => {
  it('buffers writeValue and setDisabledState until init', () => {
    // no editor yet
    comp.writeValue('<p>pending draft</p>');
    comp.setDisabledState(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((comp as any).pendingValue).toBe('<p>pending draft</p>');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((comp as any).pendingDisabled).toBe(true);
  });
});

describe('setDisabledState → editor read-only', () => {
  it('reactive-form disable() makes the editor read-only', () => {
    const ed = mockEditor(); wire(comp, ed);
    comp.setDisabledState(true);
    expect(ed.setReadOnly).toHaveBeenCalledWith(true);
    expect(ed._readOnly()).toBe(true);
    comp.setDisabledState(false);
    expect(ed._readOnly()).toBe(false);
  });
});

describe('event → output wiring', () => {
  it('onChange fires the CVA callback and the changed output', () => {
    const ed = mockEditor(); wire(comp, ed);
    const cva = vi.fn(); comp.registerOnChange(cva);
    // re-register after wire (wire captured the earlier noop)
    ed.on('onChange', (payload) => {
      const { html, text } = payload as { html: string; text: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (comp as any).cvaOnChange(html);
      comp.changed.emit({ html, text });
    });
    const changed = vi.fn(); comp.changed.subscribe(changed);
    ed._fire('onChange', { html: '<p>hi</p>', text: 'hi' });
    expect(cva).toHaveBeenCalledWith('<p>hi</p>');
    expect(changed).toHaveBeenCalledWith({ html: '<p>hi</p>', text: 'hi' });
  });

  it('blur emits the blurred output', () => {
    const ed = mockEditor(); wire(comp, ed);
    const blurred = vi.fn(); comp.blurred.subscribe(blurred);
    ed._fire('blur', { type: 'blur' });
    expect(blurred).toHaveBeenCalled();
  });
});

describe('ngOnDestroy', () => {
  it('destroys the editor and nulls the reference', () => {
    const ed = mockEditor(); wire(comp, ed);
    comp.ngOnDestroy();
    expect(ed.destroy).toHaveBeenCalled();
    expect(comp.editor).toBeNull();
  });
});
