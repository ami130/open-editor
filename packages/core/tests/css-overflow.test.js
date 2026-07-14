import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeTarget() {
  const el = document.createElement('div');
  el.id = 'editor-' + Math.random().toString(36).slice(2);
  document.body.appendChild(el);
  return el;
}

function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}

// ─── 2.28 — overflow-wrap and word-break in base CSS ────────────────────────

describe('2.28 — overflow-wrap and word-break in base editor CSS', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('injects a global style tag on init', () => {
    const styleEl = document.getElementById('oe-base-styles');
    expect(styleEl).not.toBeNull();
  });

  it('base CSS contains overflow-wrap: break-word', () => {
    const styleEl = document.getElementById('oe-base-styles');
    expect(styleEl.textContent).toContain('overflow-wrap: break-word');
  });

  it('base CSS contains word-break: break-word', () => {
    const styleEl = document.getElementById('oe-base-styles');
    expect(styleEl.textContent).toContain('word-break: break-word');
  });
});
