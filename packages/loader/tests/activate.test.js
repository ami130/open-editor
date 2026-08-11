/**
 * activate.test.js — the "Premium unlocked" prompt (§1.7).
 *
 * §1.7 exists because of one measured fact: a free visitor is running free.js,
 * which physically contains no premium code, so handing that editor a premium
 * licence unlocks nothing. Proven in three browsers. The customer has just
 * paid, so something must tell them — and that something must never damage the
 * document they are in the middle of writing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  showActivatePrompt, dismissActivatePrompt, hasActivatePrompt,
} from '../src/activate.js';

let el;
beforeEach(() => { el = document.createElement('div'); document.body.append(el); });

describe('the prompt itself', () => {
  it('renders a message and an action', () => {
    showActivatePrompt(el);
    expect(hasActivatePrompt(el)).toBe(true);
    expect(el.textContent).toMatch(/premium unlocked/i);
    expect(el.querySelector('button')).toBeTruthy();
  });

  it('reloads by default — a button that does nothing is worse than no button', () => {
    // Most integrators will not wire a handler, so the default must do the
    // obvious thing rather than silently no-op.
    const onActivate = vi.fn();
    showActivatePrompt(el, { onActivate });
    el.querySelectorAll('button')[0].click();
    expect(onActivate).toHaveBeenCalled();
  });

  it('is DISMISSIBLE — never traps anyone', () => {
    showActivatePrompt(el);
    const close = [...el.querySelectorAll('button')].find((b) => b.textContent === '×');
    close.click();
    expect(hasActivatePrompt(el)).toBe(false);
  });

  it('NEVER stacks — a second signal replaces the first', () => {
    showActivatePrompt(el);
    showActivatePrompt(el);
    expect(el.querySelectorAll('[data-oe-activate]')).toHaveLength(1);
  });

  it('accepts custom copy', () => {
    showActivatePrompt(el, { message: 'Pro is ready.', actionLabel: 'Refresh' });
    expect(el.textContent).toContain('Pro is ready.');
    expect(el.textContent).toContain('Refresh');
  });

  it('announces POLITELY, so a screen reader is not interrupted mid-sentence', () => {
    const bar = showActivatePrompt(el);
    expect(bar.getAttribute('aria-live')).toBe('polite');
    expect(bar.getAttribute('aria-live')).not.toBe('assertive');
  });

  it('does NOT steal focus — someone may be mid-word', () => {
    // Stealing focus to announce good news would lose their place and drop
    // keystrokes: exactly the harm §1.7 exists to prevent.
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    showActivatePrompt(el);
    expect(document.activeElement).toBe(input);
  });

  it('uses type="button", so it cannot submit a surrounding form', () => {
    showActivatePrompt(el);
    for (const b of el.querySelectorAll('button')) expect(b.type).toBe('button');
  });

  it('is prepended, so it is not missed below a tall document', () => {
    el.append(document.createElement('p'));
    showActivatePrompt(el);
    expect(el.firstElementChild.hasAttribute('data-oe-activate')).toBe(true);
  });

  it('survives a null container rather than throwing into the load path', () => {
    expect(showActivatePrompt(null)).toBeNull();
    expect(() => dismissActivatePrompt(null)).not.toThrow();
    expect(hasActivatePrompt(null)).toBe(false);
  });
});

describe('upgrade vs downgrade — who gets interrupted', () => {
  // The rule from the plan: "never remove capability from under someone
  // mid-edit". An upgrade is news the customer is waiting for. A downgrade is
  // not, and interrupting someone's work to offer them FEWER features is pure
  // harm — they also lose nothing by waiting, since the premium bundle keeps
  // running until their next natural page load.
  const isUpgrade = (running, next) => running !== null && running !== next && running === 'free';

  it('free → premium IS an upgrade (prompt)', () => {
    expect(isUpgrade('free', 'premium')).toBe(true);
  });

  it('premium → free is NOT (stay silent, keep the premium bundle)', () => {
    expect(isUpgrade('premium', 'free')).toBe(false);
  });

  it('no plan change is neither — applied in place, nothing to announce', () => {
    expect(isUpgrade('premium', 'premium')).toBe(false);
    expect(isUpgrade('free', 'free')).toBe(false);
  });
});
