/**
 * full-stack-gating.test.js — Phase 4.3 integrated proof (CORE + FREE plugins).
 *
 * The per-surface gating tests each prove ONE surface in isolation. This proves
 * them TOGETHER on a single realistically-built editor: install the full
 * free-plugin superset (installAllPlugins), apply ONE limited grant, and assert
 * that toolbar + free plugins + command execution ALL agree with that grant —
 * the cross-surface consistency check the isolated tests can't give.
 *
 * SCOPE: this covers the CORE editor + FREE-plugin surface (what
 * installAllPlugins installs). PREMIUM plugins live in a separate package
 * (`premium/*`) and self-gate via the premium runtime — that gate (allowed →
 * real spec, denied → no-op stub) is proven in `premium/runtime/tests/gate.test.js`,
 * NOT here (core doesn't depend on premium). What IS proven here is that the
 * SAME unified grant the core gate consumes also yields the correct verdict for
 * premium ids (isFeatureGranted('ai.*')), so one license drives both gates —
 * the seam Phase 5 relies on.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { installAllPlugins } from '../src/index.js';

let target;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  const editor = new OpenEditor(target, config);
  installAllPlugins(editor); // host contract: install the superset; grant trims.
  return editor;
}
function toolbarNames(editor) {
  return (editor.toolbar && editor.toolbar._controls || [])
    .map((c) => c.item && c.item.name)
    .filter(Boolean);
}
let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

describe('Phase 4.3 — full-stack gating (toolbar + plugins + commands agree)', () => {
  it('a limited grant is honored consistently across every surface at once', () => {
    // Grant: bold, bullet list, the image plugin, and ONE premium id (ai.translate);
    // withhold ai.review. Nothing else.
    editor = mount({ grantedFeatures: ['text.bold', 'list.bullet', 'insert.image', 'ai.translate'] });

    // Toolbar: granted core shows; ungranted core hidden.
    const names = toolbarNames(editor);
    expect(names).toContain('bold');
    expect(names).toContain('ul');
    expect(names).not.toContain('italic');
    expect(names).not.toContain('textColor');

    // Plugins: only the granted plugin installed; the rest trimmed.
    expect(editor.plugins.isInstalled('image')).toBe(true);   // insert.image granted
    expect(editor.plugins.isInstalled('table')).toBe(false);  // insert.table NOT granted
    expect(editor.plugins.isInstalled('emoji')).toBe(false);
    expect(editor.plugins.isInstalled('findReplace')).toBe(false);

    // Command execution: the central choke point agrees with the toolbar.
    expect(editor.isFeatureGranted('text.bold')).toBe(true);
    expect(editor.isFeatureGranted('text.italic')).toBe(false);

    // PREMIUM verdict: the SAME unified grant answers premium ids too — this is
    // exactly the boolean the premium runtime's gate consumes (proven to install
    // vs stub in premium/runtime/tests/gate.test.js). One license, both gates.
    expect(editor.isFeatureGranted('ai.translate')).toBe(true);  // granted premium
    expect(editor.isFeatureGranted('ai.review')).toBe(false);    // withheld premium

    // Always-on core is never gated, even under a tight grant.
    expect(editor.isFeatureGranted('undo')).toBe(true);
    expect(names).toContain('undo');
    expect(names).toContain('removeFormat');
  });

  it('empty grant: the box stays editable and every feature surface is trimmed', () => {
    editor = mount({ grantedFeatures: [] });

    const names = toolbarNames(editor);
    expect(names).not.toContain('bold');
    expect(names).not.toContain('italic');
    // always-on chrome survives so the box is never dead
    expect(names).toContain('undo');
    expect(names).toContain('redo');

    // No free plugins installed under an empty grant.
    expect([...editor.plugins.getAll().keys()].length).toBe(0);

    // "Never a dead box": the contenteditable surface is genuinely EDITABLE
    // (not readonly) even with zero features granted — a user could type. (The
    // keydown/beforeinput input path itself is exercised in editor-core.test.js;
    // here we assert the empty grant doesn't disable the surface.)
    expect(editor._state.isReadOnly).toBe(false);
    expect(editor._editorEl.contentEditable).toBe('true');

    // And the content pipeline (always-on) round-trips through the sanitizer.
    editor.setHTML('<p>hello</p>');
    expect(editor.getHTML()).toContain('hello');
  });

  it("'*' (dev host) grants the full surface with all plugins installed", () => {
    editor = mount({ grantedFeatures: ['*'] });
    const names = toolbarNames(editor);
    expect(names).toContain('bold');
    expect(names).toContain('italic');
    expect(names).toContain('textColor');
    expect(editor.plugins.isInstalled('image')).toBe(true);
    expect(editor.plugins.isInstalled('table')).toBe(true);
    expect(editor.plugins.isInstalled('findReplace')).toBe(true);
  });
});
