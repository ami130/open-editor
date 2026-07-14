import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModalManager } from '../src/ui/modal-manager.js';

function makeWrapper(doc) {
  const w = doc.createElement('div');
  doc.body.appendChild(w);
  return w;
}

describe('ModalManager', () => {
  let wrapper, mgr;

  beforeEach(() => {
    wrapper = makeWrapper(document);
    mgr = new ModalManager(wrapper, document);
  });

  afterEach(() => {
    mgr.destroy();
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  });

  // 6.1 — open() mounts a backdrop + dialog into wrapper
  it('open() renders backdrop and dialog inside wrapper', () => {
    mgr.open({ title: 'Test' });
    expect(wrapper.querySelector('.oe-backdrop')).toBeTruthy();
    expect(wrapper.querySelector('.oe-modal')).toBeTruthy();
  });

  // 6.1 — close() removes the modal
  it('close() removes the modal from the DOM', async () => {
    const p = mgr.open({ title: 'Hello' });
    expect(wrapper.querySelector('.oe-backdrop')).toBeTruthy();
    mgr.close('done');
    await p;
    expect(wrapper.querySelector('.oe-backdrop')).toBeNull();
  });

  // 6.1 — stack: two open() calls stack modals
  it('stacks two modals without resolving the first', () => {
    mgr.open({ title: 'First' });
    mgr.open({ title: 'Second' });
    expect(wrapper.querySelectorAll('.oe-backdrop').length).toBe(2);
  });

  // 6.1 — close() only pops the top modal
  it('close() only closes the topmost modal', async () => {
    mgr.open({ title: 'First' });
    const p2 = mgr.open({ title: 'Second' });
    mgr.close('second-done');
    await p2;
    expect(wrapper.querySelectorAll('.oe-backdrop').length).toBe(1);
  });

  // 6.2 — title rendered
  it('renders title text', () => {
    mgr.open({ title: 'My Title' });
    expect(wrapper.querySelector('.oe-modal__header').textContent).toBe('My Title');
  });

  // 6.2 — body as string
  it('renders body HTML string', () => {
    mgr.open({ body: '<p>Hello</p>' });
    expect(wrapper.querySelector('.oe-modal__body p')).toBeTruthy();
  });

  // 6.2 — body as DOM node
  it('renders body as DOM node', () => {
    const p = document.createElement('p');
    p.textContent = 'Node body';
    mgr.open({ body: p });
    expect(wrapper.querySelector('.oe-modal__body p').textContent).toBe('Node body');
  });

  // 6.2 — footer buttons rendered
  it('renders footer buttons', () => {
    mgr.open({ buttons: [{ label: 'OK', value: 'ok' }, { label: 'Cancel', value: null }] });
    const btns = wrapper.querySelectorAll('.oe-modal__btn');
    expect(btns.length).toBe(2);
    expect(btns[0].textContent).toBe('OK');
  });

  // 6.2 — button variant class applied
  it('applies variant class to button', () => {
    mgr.open({ buttons: [{ label: 'OK', value: 'ok', variant: 'primary' }] });
    expect(wrapper.querySelector('.oe-modal__btn--primary')).toBeTruthy();
  });

  // 6.4 — Promise resolves with button value
  it('resolves Promise with clicked button value', async () => {
    const p = mgr.open({ buttons: [{ label: 'OK', value: 'confirmed' }] });
    wrapper.querySelector('.oe-modal__btn').click();
    const result = await p;
    expect(result).toBe('confirmed');
  });

  // 6.4 — close(null) resolves with null
  it('resolves Promise with null when close() called with no value', async () => {
    const p = mgr.open({ title: 'x' });
    mgr.close();
    expect(await p).toBeNull();
  });

  // 6.2 — backdrop click closes (default closeOnBackdrop: true)
  it('backdrop click resolves with null', async () => {
    const p = mgr.open({ title: 'x' });
    wrapper.querySelector('.oe-backdrop').click();
    expect(await p).toBeNull();
  });

  // 6.2 — closeOnBackdrop: false — backdrop click does nothing
  it('backdrop click does nothing when closeOnBackdrop is false', async () => {
    let resolved = false;
    const p = mgr.open({ title: 'x', closeOnBackdrop: false });
    p.then(() => { resolved = true; });
    wrapper.querySelector('.oe-backdrop').click();
    await Promise.resolve();
    expect(resolved).toBe(false);
    mgr.close();
    await p;
  });

  // 6.2 — Escape key closes modal
  it('Escape key resolves modal with null', async () => {
    const p = mgr.open({ title: 'x' });
    const dialog = wrapper.querySelector('.oe-modal');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toBeNull();
  });

  // 6.2 — closeOnEscape: false — Escape does nothing
  it('Escape does nothing when closeOnEscape is false', async () => {
    let resolved = false;
    const p = mgr.open({ title: 'x', closeOnEscape: false });
    p.then(() => { resolved = true; });
    const dialog = wrapper.querySelector('.oe-modal');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
    expect(resolved).toBe(false);
    mgr.close();
    await p;
  });

  // 6.8 — scoped to wrapper, not document.body
  it('modal is appended inside wrapper, not document.body', () => {
    mgr.open({ title: 'scoped' });
    expect(document.body.querySelector(':scope > .oe-backdrop')).toBeNull();
    expect(wrapper.querySelector('.oe-backdrop')).toBeTruthy();
  });

  // 6.9 — ARIA roles
  it('dialog has role="dialog" and aria-modal="true"', () => {
    mgr.open({ title: 'aria' });
    const dialog = wrapper.querySelector('.oe-modal');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('dialog has aria-labelledby pointing to title', () => {
    mgr.open({ title: 'Labeled' });
    const dialog = wrapper.querySelector('.oe-modal');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId)).toBeTruthy();
  });

  // closeAll resolves all open modals
  it('closeAll() resolves all stacked modals', async () => {
    const p1 = mgr.open({ title: 'A' });
    const p2 = mgr.open({ title: 'B' });
    mgr.closeAll();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(wrapper.querySelector('.oe-backdrop')).toBeNull();
  });

  // destroy while modal open resolves all
  it('destroy() while modal is open closes and resolves all', async () => {
    const p = mgr.open({ title: 'open' });
    mgr.destroy();
    expect(await p).toBeNull();
  });

  // 6.3 — focus trap: Tab wraps from last to first focusable
  it('Tab on last focusable element wraps to first', () => {
    mgr.open({ buttons: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] });
    const btns = Array.from(wrapper.querySelectorAll('.oe-modal__btn'));
    // Dispatch Tab from the last button itself — it bubbles to the dialog where the trap listens.
    // document.activeElement must match the last button for the trap to fire the wrap.
    btns[btns.length - 1].focus();
    btns[btns.length - 1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(btns[0]);
    mgr.closeAll();
  });

  // 6.3 — focus trap: Shift+Tab wraps from first to last focusable
  it('Shift+Tab on first focusable element wraps to last', () => {
    mgr.open({ buttons: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] });
    const btns = Array.from(wrapper.querySelectorAll('.oe-modal__btn'));
    btns[0].focus();
    btns[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(btns[btns.length - 1]);
    mgr.closeAll();
  });

  // 6.3 — stacked modals: lower modal trap does not fire when upper modal handles Tab
  it('lower modal trap does not steal Tab from upper modal', () => {
    mgr.open({ buttons: [{ label: 'Lower', value: 'lower' }] });
    mgr.open({ buttons: [{ label: 'Upper', value: 'upper' }] });
    const dialogs = wrapper.querySelectorAll('.oe-modal');
    const upperDialog = dialogs[dialogs.length - 1];
    const upperBtn = upperDialog.querySelector('.oe-modal__btn');
    upperBtn.focus();
    // Tab on upper dialog — stopPropagation prevents lower trap from firing
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    upperDialog.dispatchEvent(tabEvent);
    // Active element should still be inside upper dialog, not lower
    expect(upperDialog.contains(document.activeElement)).toBe(true);
    mgr.closeAll();
  });

  // ID uniqueness — no Date.now() collision
  it('two simultaneous modals have distinct aria-labelledby ids', () => {
    mgr.open({ title: 'First' });
    mgr.open({ title: 'Second' });
    const dialogs = wrapper.querySelectorAll('.oe-modal');
    const id1 = dialogs[0].getAttribute('aria-labelledby');
    const id2 = dialogs[1].getAttribute('aria-labelledby');
    expect(id1).not.toBe(id2);
    mgr.closeAll();
  });
});
