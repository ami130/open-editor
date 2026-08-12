/**
 * license-dx.test.ts — Phase 2 Angular licensing DX (wiring logic).
 *
 * Drives the component class against a MOCKED core `OpenEditor` (no TestBed /
 * real license — the real integration is the consumer app). Crucially, the
 * event-wiring tests run the component's REAL `ngAfterViewInit` (with core
 * mocked to return our fake editor) so we prove the component itself subscribes
 * to licenseError/premiumReady and forwards them to its @Outputs — not a
 * re-implemented binding in the test. The ngOnChanges tests drive the real
 * reactive re-verify path (licenseKey/licenseKeys → setLicenseKey).
 */
import '@angular/compiler';
import 'zone.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SimpleChanges } from '@angular/core';

// Mock the core so the component's REAL `new OpenEditor(...)` in ngAfterViewInit
// returns our fake — letting us fire events through the component's own wiring.
const handlers: Record<string, (p: unknown) => void> = {};
const fakeEditor = {
  _fire: (evt: string, p: unknown) => handlers[evt]?.(p),
  getHTML: () => '<p></p>',
  setHTML: vi.fn(), setReadOnly: vi.fn(), setTheme: vi.fn(), setDirection: vi.fn(),
  setLicenseKey: vi.fn(), isDestroyed: () => false, destroy: vi.fn(),
  on: (evt: string, fn: (p: unknown) => void) => { handlers[evt] = fn; },
  plugins: { install: vi.fn() },
};
vi.mock('openeditor-text-engine', () => ({
  OpenEditor: vi.fn().mockImplementation(() => fakeEditor),
}));

// Import AFTER the mock is registered.
const { OpenEditorComponent } = await import('../src/open-editor.component');

let comp: InstanceType<typeof OpenEditorComponent>;
beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  fakeEditor.setLicenseKey.mockClear();
  comp = new OpenEditorComponent();
  // Provide the @ViewChild host that ngAfterViewInit reads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (comp as any).host = { nativeElement: document.createElement('div') };
});

describe('Phase 2 — Angular license event → @Output wiring (via REAL ngAfterViewInit)', () => {
  it('licenseError from the editor reaches the licenseError @Output', () => {
    comp.ngAfterViewInit(); // the component itself subscribes to editor events
    let received: { reason: string } | null = null;
    comp.licenseError.subscribe((p) => { received = p as { reason: string }; });
    fakeEditor._fire('licenseError', { reason: 'domain-mismatch' });
    expect(received).toEqual({ reason: 'domain-mismatch' });
  });

  it('premiumReady from the editor reaches the premiumReady @Output', () => {
    comp.ngAfterViewInit();
    let received: { installed: string[] } | null = null;
    comp.premiumReady.subscribe((p) => { received = p as { installed: string[] }; });
    fakeEditor._fire('premiumReady', { installed: ['seo'] });
    expect(received).toEqual({ installed: ['seo'] });
  });
});

describe('Phase 2 — Angular reactive licenseKey/licenseKeys via ngOnChanges', () => {
  beforeEach(() => { comp.ngAfterViewInit(); }); // editor is live

  it('a licenseKey change (not first) calls core.setLicenseKey with key + keys', () => {
    comp.licenseKey = 'new-token';
    comp.licenseKeys = [{ kid: 'k', jwk: {} as JsonWebKey }];
    const changes: SimpleChanges = {
      licenseKey: { previousValue: null, currentValue: 'new-token', firstChange: false, isFirstChange: () => false },
    };
    comp.ngOnChanges(changes);
    expect(fakeEditor.setLicenseKey).toHaveBeenCalledWith('new-token', comp.licenseKeys);
  });

  it('the FIRST licenseKey change does NOT call setLicenseKey (already applied at construct)', () => {
    comp.licenseKey = 'first-token';
    const changes: SimpleChanges = {
      licenseKey: { previousValue: undefined, currentValue: 'first-token', firstChange: true, isFirstChange: () => true },
    };
    comp.ngOnChanges(changes);
    expect(fakeEditor.setLicenseKey).not.toHaveBeenCalled();
  });

  it('a licenseKeys-ONLY change (key unchanged) also re-verifies (parity with React/Vue)', () => {
    comp.licenseKey = 'same-token';
    comp.licenseKeys = [{ kid: 'new', jwk: {} as JsonWebKey }];
    const changes: SimpleChanges = {
      licenseKeys: { previousValue: [], currentValue: comp.licenseKeys, firstChange: false, isFirstChange: () => false },
    };
    comp.ngOnChanges(changes);
    expect(fakeEditor.setLicenseKey).toHaveBeenCalledWith('same-token', comp.licenseKeys);
  });

  it('clearing the licenseKey (falsy) calls setLicenseKey(null, keys)', () => {
    comp.licenseKey = null;
    comp.licenseKeys = undefined;
    const changes: SimpleChanges = {
      licenseKey: { previousValue: 'had-one', currentValue: null, firstChange: false, isFirstChange: () => false },
    };
    comp.ngOnChanges(changes);
    expect(fakeEditor.setLicenseKey).toHaveBeenCalledWith(null, undefined);
  });
});
