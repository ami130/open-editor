/**
 * install-all-plugins.test.js — the gating-contract helper (Gap #2 fix).
 *
 * installAllPlugins() installs the full free-plugin superset; the license grant
 * (via PluginManager's install-gate, Phase 2.8) trims it so the grant alone
 * decides what appears — closing the "grant can only suppress, not install" gap.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { installAllPlugins, ALL_FREE_PLUGINS } from '../src/index.js';

let target;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  return new OpenEditor(target, config);
}
let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

describe('installAllPlugins — full superset, grant trims', () => {
  it('exposes all 21 free plugin factories', () => {
    expect(ALL_FREE_PLUGINS.length).toBe(21);
  });

  it('default (grant-all): installs every free plugin', () => {
    editor = mount({});
    installAllPlugins(editor);
    expect(editor.plugins.isInstalled('image')).toBe(true);
    expect(editor.plugins.isInstalled('table')).toBe(true);
    expect(editor.plugins.isInstalled('findReplace')).toBe(true);
  });

  it('limited license: installs ONLY granted plugins (grant alone decides)', () => {
    editor = mount({ grantedFeatures: ['insert.image', 'insert.link'] });
    installAllPlugins(editor);
    expect(editor.plugins.isInstalled('image')).toBe(true);   // insert.image granted
    expect(editor.plugins.isInstalled('link')).toBe(true);    // insert.link granted
    expect(editor.plugins.isInstalled('table')).toBe(false);  // insert.table NOT granted
    expect(editor.plugins.isInstalled('emoji')).toBe(false);
    expect(editor.plugins.isInstalled('findReplace')).toBe(false);
  });

  it('empty grant: installs no free plugins', () => {
    editor = mount({ grantedFeatures: [] });
    installAllPlugins(editor);
    expect([...editor.plugins.getAll().keys()].length).toBe(0);
  });
});
