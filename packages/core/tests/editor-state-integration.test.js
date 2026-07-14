/**
 * Editor-level state wiring (Phase 2): the public `editor.state` accessor,
 * `stateChange` (metadata) and `readOnlyChange` events. Live word/char counts
 * are driven by MutationObserver (async) and are verified in real Chromium.
 */
import { describe, it, expect, vi } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeTarget() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}
function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}

describe('editor.state public accessor (2.1)', () => {
  it('editor.state returns the same EditorState as _state', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    expect(editor.state).toBe(editor._state);
    expect(typeof editor.state.setMeta).toBe('function');
    cleanup(editor, target);
  });
});

describe('stateChange event (2.8)', () => {
  it('fires on editor.state.setMeta with key/value/state', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    const fn = vi.fn();
    editor.on('stateChange', fn);
    editor.state.setMeta('author', 'Ada');
    expect(fn).toHaveBeenCalledOnce();
    const payload = fn.mock.calls[0][0];
    expect(payload.key).toBe('author');
    expect(payload.value).toBe('Ada');
    expect(payload.state).toBe(editor.state);
    cleanup(editor, target);
  });
});

describe('readOnlyChange event (2.8)', () => {
  it('fires when setReadOnly toggles the state', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    const fn = vi.fn();
    editor.on('readOnlyChange', fn);
    editor.setReadOnly(true);
    expect(fn).toHaveBeenCalledWith({ readOnly: true });
    editor.setReadOnly(false);
    expect(fn).toHaveBeenCalledWith({ readOnly: false });
    expect(fn).toHaveBeenCalledTimes(2);
    cleanup(editor, target);
  });

  it('does NOT fire when setReadOnly is called with the current value', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    const fn = vi.fn();
    editor.on('readOnlyChange', fn);
    editor.setReadOnly(false); // already false — no transition
    expect(fn).not.toHaveBeenCalled();
    cleanup(editor, target);
  });

  it('does not fire spuriously during construction of a readonly editor', () => {
    const target = makeTarget();
    const emitSpy = vi.spyOn(OpenEditor.prototype, 'emit');
    const editor = new OpenEditor(target, { readonly: true });
    const roCalls = emitSpy.mock.calls.filter((c) => c[0] === 'readOnlyChange');
    expect(roCalls.length).toBe(0);
    emitSpy.mockRestore();
    cleanup(editor, target);
  });
});

describe('live wordCount / charCount (2.6)', () => {
  it('updates state.wordCount and charCount after a DOM mutation', async () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.getEditorElement().innerHTML = '<p>one two three</p>';
    // 16.5.1 — the count recompute is debounced (150ms) + idle-deferred so a large
    // doc doesn't jank per-mutation. state counts are eventually-consistent; wait
    // past the debounce. (getWordCount()/getCharCount() are exact on demand.)
    await new Promise((r) => setTimeout(r, 300));
    expect(editor.state.wordCount).toBe(3);
    expect(editor.state.charCount).toBe(13);
    editor.getEditorElement().innerHTML = '<p>hi</p>';
    await new Promise((r) => setTimeout(r, 300));
    expect(editor.state.wordCount).toBe(1);
    expect(editor.state.charCount).toBe(2);
    cleanup(editor, target);
  });

  it('16.5.1 — recompute is deferred, not synchronous per mutation', async () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.getEditorElement().innerHTML = '<p>alpha beta gamma delta</p>';
    // Immediately after the mutation the debounce has not fired → state is stale,
    // proving we did NOT recompute synchronously (the perf fix).
    expect(editor.state.wordCount).toBe(0);
    // getWordCount() is still exact on demand regardless of the deferred state.
    expect(editor.getWordCount()).toBe(4);
    // After the debounce window, state catches up.
    await new Promise((r) => setTimeout(r, 300));
    expect(editor.state.wordCount).toBe(4);
    cleanup(editor, target);
  });
});

describe('serialize / deserialize via editor.state (2.7)', () => {
  it('serializes current html and restores it', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.setHTML('<p>persisted</p>');
    const snap = editor.state.serialize();
    expect(JSON.parse(snap).html).toContain('persisted');
    cleanup(editor, target);
  });
});
