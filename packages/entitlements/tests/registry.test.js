import { describe, it, expect } from 'vitest';
import {
  FEATURES, getFeature, allFeatureIds, isRegisteredFeature,
  isValidFeatureIdShape, validateFeatureList,
} from '../src/feature-registry.js';

describe('feature registry (22.1)', () => {
  it('every registered id is shape-valid and carries meta', () => {
    for (const id of allFeatureIds()) {
      expect(isValidFeatureIdShape(id)).toBe(true);
      expect(getFeature(id)).toMatchObject({ title: expect.any(String), since: expect.any(String) });
    }
  });

  it('shape rule accepts dot-namespaced camel ids, rejects junk', () => {
    expect(isValidFeatureIdShape('export.pdf')).toBe(true);
    expect(isValidFeatureIdShape('track.changes')).toBe(true);
    expect(isValidFeatureIdShape('Export.Pdf')).toBe(false); // segments start lowercase
    expect(isValidFeatureIdShape('export.')).toBe(false);
    expect(isValidFeatureIdShape('.pdf')).toBe(false);
    expect(isValidFeatureIdShape('export pdf')).toBe(false);
    expect(isValidFeatureIdShape(42)).toBe(false);
  });

  it('validateFeatureList separates unknown from malformed', () => {
    const r = validateFeatureList(['export.pdf', 'not.real', 'BAD ID']);
    expect(r.ok).toBe(false);
    expect(r.unknown).toEqual(['not.real']);
    expect(r.malformed).toEqual(['BAD ID']);
  });

  it('a fully-registered list validates ok', () => {
    expect(validateFeatureList(['export.pdf', 'comments']).ok).toBe(true);
  });

  it('additive-only guard: known ids stay stable (canary)', () => {
    // If this fails because an id was RENAMED/REMOVED, that is a breaking
    // change that invalidates issued licenses — add the new id, keep the old.
    // This is the FULL frozen Phase-19 vocabulary (2026-07-17): the admin
    // plan-builder composes packages from exactly these ids.
    const FROZEN = [
      'export.pdf', 'export.docx', 'export.markdown', 'import.word',
      'seo', 'footnotes',
      'versionHistory', 'comments', 'track.changes',
      'collab.rt',
      'ai.panel', 'ai.quickActions', 'ai.review', 'ai.translate',
      'restrictedEditing.roles',
      'lists.legal', 'outline.toc', 'mergeFields', 'pagination',
      'dev.smoke',
    ];
    for (const id of FROZEN) expect(isRegisteredFeature(id), id).toBe(true);
    expect(Object.keys(FEATURES).length).toBeGreaterThanOrEqual(FROZEN.length);
  });
});
