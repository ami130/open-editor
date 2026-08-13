/**
 * Stage 3 — `strictEntitlements`: the token as the ONLY source of truth.
 *
 * The property that matters most here is the DEFAULT: this flag is breaking,
 * so with it off nothing may change for anyone.
 */
import { describe, it, expect } from 'vitest';
import { createFeatureGate, FREE_SET, ALWAYS_ON } from '../src/entitlements/feature-gate.js';

/** A verified-licence stand-in that grants exactly the listed ids. */
const entitlementsFor = (ids) => ({ isGranted: (id) => ids.includes(id) });

// A free-set feature that a package could plausibly exclude.
const someFreeFeature = [...FREE_SET].find((id) => !ALWAYS_ON.has(id));

describe('strictEntitlements — the default must change nothing', () => {
  it('OFF by default: a token listing only premium still grants free features', () => {
    // This is the historical contract. A real production token listed
    // ['export.pdf'] alone, and the engine granted the free set on top.
    // Breaking this would strip ~53 features from every paying customer.
    const gate = createFeatureGate({
      enforceFreeTier: true,
      entitlements: entitlementsFor(['export.pdf']),
    });
    expect(gate('export.pdf')).toBe(true);
    expect(gate(someFreeFeature)).toBe(true);
  });

  it('OFF explicitly behaves the same as omitted', () => {
    const omitted = createFeatureGate({
      enforceFreeTier: true, entitlements: entitlementsFor(['export.pdf']),
    });
    const explicit = createFeatureGate({
      enforceFreeTier: true, strictEntitlements: false,
      entitlements: entitlementsFor(['export.pdf']),
    });
    for (const id of [someFreeFeature, 'export.pdf', 'export.docx']) {
      expect(explicit(id)).toBe(omitted(id));
    }
  });
});

describe('strictEntitlements — ON', () => {
  it('grants EXACTLY what the token lists', () => {
    // The point of admin-defined packages: a package that excludes a feature
    // can actually restrict it.
    const gate = createFeatureGate({
      enforceFreeTier: true, strictEntitlements: true,
      entitlements: entitlementsFor(['text.bold', 'export.pdf']),
    });
    expect(gate('text.bold')).toBe(true);
    expect(gate('export.pdf')).toBe(true);
    expect(gate(someFreeFeature === 'text.bold' ? 'text.italic' : someFreeFeature)).toBe(false);
  });

  it('a SELF-SUFFICIENT token (free ∪ package) keeps everything working', () => {
    // What the backend now issues. Strict mode must be a no-op for these.
    const full = [...FREE_SET, 'export.pdf'];
    const gate = createFeatureGate({
      enforceFreeTier: true, strictEntitlements: true,
      entitlements: entitlementsFor(full),
    });
    expect(gate(someFreeFeature)).toBe(true);
    expect(gate('export.pdf')).toBe(true);
  });

  it('ALWAYS_ON survives strict mode — gating it would BREAK the editor', () => {
    // typing/undo/clipboard/selection are structural, not a tier. A token that
    // omits them must not disable them.
    const gate = createFeatureGate({
      enforceFreeTier: true, strictEntitlements: true,
      entitlements: entitlementsFor([]),   // grants nothing at all
    });
    for (const id of ALWAYS_ON) expect(gate(id)).toBe(true);
  });

  it('does not leak premium: an empty token grants no premium', () => {
    const gate = createFeatureGate({
      enforceFreeTier: true, strictEntitlements: true,
      entitlements: entitlementsFor([]),
    });
    expect(gate('export.pdf')).toBe(false);
    expect(gate('export.docx')).toBe(false);
  });

  it('is INERT without enforceFreeTier — it must not tighten the legacy path', () => {
    // My first version of this test asserted grant-all with an entitlements
    // object present, and failed. Reading the gate: in legacy mode an
    // entitlements object is STILL authoritative — `grantAll` applies only when
    // there is no config at all. So the honest assertion is that strict mode
    // changes NOTHING on the legacy path, not that everything is granted.
    const withStrict = createFeatureGate({
      enforceFreeTier: false, strictEntitlements: true,
      entitlements: entitlementsFor(['export.pdf']),
    });
    const withoutStrict = createFeatureGate({
      enforceFreeTier: false,
      entitlements: entitlementsFor(['export.pdf']),
    });
    for (const id of ['export.pdf', 'export.docx', someFreeFeature]) {
      expect(withStrict(id)).toBe(withoutStrict(id));
    }

    // And a truly configuration-free legacy embed still grants everything.
    const bare = createFeatureGate({ enforceFreeTier: false });
    expect(bare('export.pdf')).toBe(true);
  });
});
