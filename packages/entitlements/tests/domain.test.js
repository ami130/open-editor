import { describe, it, expect } from 'vitest';
import { isDevHost, hostMatchesPattern, hostAllowed } from '../src/domain-check.js';

describe('dev-host exemption (22.2 Jodit rule — HARDENED narrow list)', () => {
  it('treats only the loopback family + *.localhost as dev', () => {
    for (const h of ['localhost', '127.0.0.1', '::1', 'foo.localhost', 'LOCALHOST']) {
      expect(isDevHost(h)).toBe(true);
    }
  });
  it('does NOT exempt .local / .test (removed — they unlocked corporate LANs)', () => {
    for (const h of ['app.local', 'printer.local', 'x.test', 'staging.test']) {
      expect(isDevHost(h)).toBe(false);
    }
  });
  it('production hosts are not dev', () => {
    for (const h of ['customer.com', 'app.customer.com', 'localhost.attacker.com', '']) {
      expect(isDevHost(h)).toBe(false);
    }
  });
});

describe('hostMatchesPattern (22.5a)', () => {
  it('exact match only, case-insensitive', () => {
    expect(hostMatchesPattern('customer.com', 'customer.com')).toBe(true);
    expect(hostMatchesPattern('CUSTOMER.com', 'customer.COM')).toBe(true);
    expect(hostMatchesPattern('app.customer.com', 'customer.com')).toBe(false);
  });
  it('single-level wildcard, not apex, not multi-level', () => {
    expect(hostMatchesPattern('app.customer.com', '*.customer.com')).toBe(true);
    expect(hostMatchesPattern('customer.com', '*.customer.com')).toBe(false);
    expect(hostMatchesPattern('a.b.customer.com', '*.customer.com')).toBe(false);
  });
  it('malformed patterns fail closed', () => {
    expect(hostMatchesPattern('x.com', '*.')).toBe(false);
    expect(hostMatchesPattern('x.com', '*.*.com')).toBe(false);
    expect(hostMatchesPattern('x.com', 42)).toBe(false);
  });
  it('cannot be fooled by a suffix that is not a label boundary', () => {
    // evilcustomer.com must NOT match *.customer.com
    expect(hostMatchesPattern('evilcustomer.com', '*.customer.com')).toBe(false);
  });
});

describe('hostAllowed', () => {
  it('matches any pattern in the list', () => {
    expect(hostAllowed('app.customer.com', ['other.com', '*.customer.com'])).toBe(true);
    expect(hostAllowed('app.customer.com', ['other.com'])).toBe(false);
    expect(hostAllowed('app.customer.com', 'not-an-array')).toBe(false);
  });
});
