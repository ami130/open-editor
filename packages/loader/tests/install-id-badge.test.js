/**
 * §2.4 — the install-id badge. Without this the whole activation flow is
 * unusable: checkout accepts an id, fulfilment arms a claim, the session
 * redeems it, and the customer has no way to learn what their id IS.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showInstallId, hideInstallId, hasInstallId } from '../src/install-id-badge.js';

describe('install id badge', () => {
  let host;
  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('shows the id a buyer must paste at checkout', () => {
    const badge = showInstallId(host);
    expect(badge).toBeTruthy();
    expect(hasInstallId(host)).toBe(true);
    // The exact format the checkout field validates against.
    expect(host.textContent).toMatch(/oe_[0-9a-f]{32}/);
  });

  it('shows the SAME id across calls — a changing id would never activate', () => {
    showInstallId(host);
    const first = host.textContent.match(/oe_[0-9a-f]{32}/)[0];
    hideInstallId(host);
    showInstallId(host);
    expect(host.textContent).toContain(first);
  });

  it('never stacks — re-showing replaces rather than appends', () => {
    showInstallId(host);
    showInstallId(host);
    expect(host.querySelectorAll('[data-oe-install-id]').length).toBe(1);
  });

  it('copies to the clipboard on click', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    showInstallId(host);
    host.querySelector('button').click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^oe_[0-9a-f]{32}$/));
    vi.unstubAllGlobals();
  });

  it('says so plainly when storage is blocked, instead of showing an empty box', () => {
    // Private browsing / sandboxed iframe: there is no id, so activation cannot
    // work. A customer must not paste an empty value and silently get nothing.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const spyGet = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => null);
    showInstallId(host);
    expect(host.textContent).toMatch(/storage|unavailable|email/i);
    expect(host.textContent).not.toMatch(/oe_[0-9a-f]{32}/);
    spy.mockRestore(); spyGet.mockRestore();
  });

  it('hide removes it', () => {
    showInstallId(host);
    hideInstallId(host);
    expect(hasInstallId(host)).toBe(false);
  });
});
