/**
 * link-sanitizer.test.js — Phase 10.9 href whitelist + <a> attribute allowlist.
 * Covers isAllowedLinkHref (strict allowlist) and the class/aria-label additions
 * to the <a> tag in the sanitizer.
 */
import { describe, it, expect } from 'vitest';
import { isAllowedLinkHref } from '../src/sanitizer/sanitizer-utils.js';
import { sanitize } from '../src/sanitizer/sanitizer.js';

describe('10.9 — isAllowedLinkHref (whitelist)', () => {
  it('allows http and https', () => {
    expect(isAllowedLinkHref('http://example.com')).toBe(true);
    expect(isAllowedLinkHref('https://example.com/path?q=1#x')).toBe(true);
  });
  it('allows mailto and tel', () => {
    expect(isAllowedLinkHref('mailto:a@b.com')).toBe(true);
    expect(isAllowedLinkHref('tel:+1234567890')).toBe(true);
  });
  it('allows in-page anchors and relative paths', () => {
    expect(isAllowedLinkHref('#section')).toBe(true);
    expect(isAllowedLinkHref('/root/path')).toBe(true);
    expect(isAllowedLinkHref('./rel')).toBe(true);
    expect(isAllowedLinkHref('../up')).toBe(true);
    expect(isAllowedLinkHref('page.html')).toBe(true);
    expect(isAllowedLinkHref('folder/page.html')).toBe(true);
  });
  it('allows protocol-relative //host', () => {
    expect(isAllowedLinkHref('//cdn.example.com/x')).toBe(true);
  });
  it('blocks javascript, data, vbscript, blob, and unknown schemes', () => {
    expect(isAllowedLinkHref('javascript:alert(1)')).toBe(false);
    expect(isAllowedLinkHref('data:text/html,<script>')).toBe(false);
    expect(isAllowedLinkHref('vbscript:msgbox(1)')).toBe(false);
    expect(isAllowedLinkHref('blob:https://x/y')).toBe(false);
    expect(isAllowedLinkHref('ftp://host/file')).toBe(false);
    expect(isAllowedLinkHref('custom:whatever')).toBe(false);
  });
  it('blocks control-char evasion (\\x01javascript:)', () => {
    expect(isAllowedLinkHref('javascript:alert(1)')).toBe(false);
    expect(isAllowedLinkHref('java\tscript:alert(1)')).toBe(false);
  });
  it('rejects empty / non-string', () => {
    expect(isAllowedLinkHref('')).toBe(false);
    expect(isAllowedLinkHref('   ')).toBe(false);
    expect(isAllowedLinkHref(null)).toBe(false);
    expect(isAllowedLinkHref(undefined)).toBe(false);
  });
});

describe('10.17/10.18 — <a> allows class + aria-label through sanitizer', () => {
  it('preserves class and aria-label on anchors', () => {
    const html = '<p><a href="https://x.com" class="btn primary" aria-label="Go to X">X</a></p>';
    const out = sanitize(html, {});
    expect(out).toContain('href="https://x.com"');
    expect(out).toContain('class="btn primary"');
    expect(out).toContain('aria-label="Go to X"');
  });
  it('still strips javascript: href at the sanitizer layer', () => {
    const html = '<p><a href="javascript:alert(1)" class="x">bad</a></p>';
    const out = sanitize(html, {});
    expect(out).not.toContain('javascript:');
    // class survives, href removed
    expect(out).toContain('class="x"');
  });
  it('auto-adds rel="noopener noreferrer" on target="_blank"', () => {
    const html = '<p><a href="https://x.com" target="_blank">X</a></p>';
    const out = sanitize(html, {});
    expect(out).toContain('rel="noopener noreferrer"');
  });
  // H1 fix — tabnabbing bypasses that the old exact-match/substring check missed.
  it('adds noopener for uppercase target="_BLANK"', () => {
    const out = sanitize('<p><a href="https://x.com" target="_BLANK">X</a></p>', {});
    expect(out).toContain('noopener');
  });
  it('adds noopener for target with surrounding whitespace "_blank "', () => {
    const out = sanitize('<p><a href="https://x.com" target="_blank ">X</a></p>', {});
    expect(out).toContain('noopener');
  });
  it('adds a real noopener token when rel only has the fake "noopeners-fake"', () => {
    const out = sanitize('<p><a href="https://x.com" target="_blank" rel="noopeners-fake">X</a></p>', {});
    // The rel must contain a standalone noopener token, not just the fake substring.
    const relMatch = out.match(/rel="([^"]*)"/);
    expect(relMatch).not.toBeNull();
    const tokens = relMatch[1].split(/\s+/);
    expect(tokens).toContain('noopener');
  });
  it('does not duplicate noopener when already a valid token', () => {
    const out = sanitize('<p><a href="https://x.com" target="_blank" rel="noopener">X</a></p>', {});
    const relMatch = out.match(/rel="([^"]*)"/);
    const count = relMatch[1].split(/\s+/).filter((t) => t === 'noopener').length;
    expect(count).toBe(1);
  });
  it('preserves a safe inline color style on <a>', () => {
    const html = '<p><a href="https://x.com" style="color: #e11d48;">X</a></p>';
    const out = sanitize(html, {});
    expect(out).toContain('color');
    expect(out).toContain('#e11d48');
  });
  it('strips a dangerous style on <a> (isUnsafeStyle guard still applies)', () => {
    const html = '<p><a href="https://x.com" style="background:url(javascript:alert(1))">X</a></p>';
    const out = sanitize(html, {});
    expect(out).not.toContain('javascript:');
  });
});
