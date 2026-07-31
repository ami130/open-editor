/**
 * plugin-gating.test.js — Phase 2.8 proof.
 * A free plugin whose feature isn't granted is not installed at all.
 * Unmapped/granted plugins install normally; default (grant-all) unchanged.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { createLinkPlugin, createImagePlugin, createTablePlugin } from '../src/index.js';

let target;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  return new OpenEditor(target, config);
}
let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

describe('Phase 2.8 — free plugin gating', () => {
  it('default (grant-all): plugins install', () => {
    editor = mount({});
    editor.plugins.install(createLinkPlugin());
    editor.plugins.install(createImagePlugin());
    expect(editor.plugins.isInstalled('link')).toBe(true);
    expect(editor.plugins.isInstalled('image')).toBe(true);
  });

  it('limited license: only granted plugins install', () => {
    editor = mount({ grantedFeatures: ['insert.link'] });
    editor.plugins.install(createLinkPlugin());   // insert.link granted
    editor.plugins.install(createImagePlugin());  // insert.image NOT granted
    editor.plugins.install(createTablePlugin());  // insert.table NOT granted
    expect(editor.plugins.isInstalled('link')).toBe(true);
    expect(editor.plugins.isInstalled('image')).toBe(false);
    expect(editor.plugins.isInstalled('table')).toBe(false);
  });
});
