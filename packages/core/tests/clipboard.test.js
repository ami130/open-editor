import { describe, it, expect, vi, afterEach } from 'vitest';
import { isClipboardApiAvailable, copyToClipboard, getClipboardText } from '../src/utils/clipboard.js';

// ─── isClipboardApiAvailable ─────────────────────────────────────────────────

describe('isClipboardApiAvailable()', () => {
  it('returns false when navigator.clipboard is undefined', () => {
    // jsdom does not provide navigator.clipboard by default
    expect(isClipboardApiAvailable()).toBe(false);
  });

  it('returns false when window.isSecureContext is false', () => {
    const origClipboard = navigator.clipboard;
    const origSecure = window.isSecureContext;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: false,
      configurable: true,
    });
    expect(isClipboardApiAvailable()).toBe(false);
    Object.defineProperty(navigator, 'clipboard', { value: origClipboard, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: origSecure, configurable: true });
  });
});

// ─── copyToClipboard ─────────────────────────────────────────────────────────

describe('copyToClipboard()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves false (not throws) when clipboard API is unavailable and execCommand fails', async () => {
    // jsdom does not define execCommand — define it so we can spy
    if (!document.execCommand) document.execCommand = () => false;
    vi.spyOn(document, 'execCommand').mockReturnValue(false);
    const result = await copyToClipboard('hello');
    expect(result).toBe(false);
  });

  it('resolves true when execCommand returns true', async () => {
    if (!document.execCommand) document.execCommand = () => false;
    vi.spyOn(document, 'execCommand').mockReturnValue(true);
    const result = await copyToClipboard('hello');
    expect(result).toBe(true);
  });

  it('resolves false when input is not a string', async () => {
    const result = await copyToClipboard(null);
    expect(result).toBe(false);
  });

  it('resolves false when input is undefined', async () => {
    const result = await copyToClipboard(undefined);
    expect(result).toBe(false);
  });

  it('does not throw when navigator.clipboard.writeText rejects and execCommand also fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    if (!document.execCommand) document.execCommand = () => false;
    vi.spyOn(document, 'execCommand').mockReturnValue(false);

    const result = await copyToClipboard('test');
    expect(result).toBe(false);

    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  });

  it('resolves true when navigator.clipboard.writeText resolves', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    const result = await copyToClipboard('test');
    expect(result).toBe(true);

    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  });

  it('M2: textarea is removed from DOM even when execCommand throws', async () => {
    if (!document.execCommand) document.execCommand = () => false;
    vi.spyOn(document, 'execCommand').mockImplementation(() => { throw new Error('not allowed'); });
    const before = document.body.querySelectorAll('textarea').length;
    const result = await copyToClipboard('hello');
    expect(result).toBe(false);
    expect(document.body.querySelectorAll('textarea').length).toBe(before);
  });
});

// ─── getClipboardText ────────────────────────────────────────────────────────

describe('getClipboardText()', () => {
  function mockEvent(textPlain = '', textHtml = '') {
    return {
      clipboardData: {
        getData: (type) => {
          if (type === 'text/plain') return textPlain;
          if (type === 'text/html') return textHtml;
          return '';
        },
      },
    };
  }

  it('returns null when event is null', () => {
    expect(getClipboardText(null)).toBeNull();
  });

  it('returns null when clipboardData is missing', () => {
    expect(getClipboardText({})).toBeNull();
  });

  it('returns null when both plain and html are empty', () => {
    expect(getClipboardText(mockEvent('', ''))).toBeNull();
  });

  it('returns plain text by default', () => {
    expect(getClipboardText(mockEvent('hello', '<p>hello</p>'))).toBe('hello');
  });

  it('returns html when preferHtml is true and html is available', () => {
    expect(getClipboardText(mockEvent('hello', '<p>hello</p>'), true)).toBe('<p>hello</p>');
  });

  it('falls back to plain text when preferHtml is true but html is empty', () => {
    expect(getClipboardText(mockEvent('hello', ''), true)).toBe('hello');
  });

  it('returns null when preferHtml is true and both html and plain are empty', () => {
    expect(getClipboardText(mockEvent('', ''), true)).toBeNull();
  });
});
