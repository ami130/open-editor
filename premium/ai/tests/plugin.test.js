/**
 * AI premium plugins — gated activation + behavior against a REAL OpenEditor
 * with a mocked streaming fetch (so the free aiComplete hook actually runs).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAiQuickActionsPlugin, createAiChatPlugin, createAiTranslatePlugin, createAiReviewPlugin,
  QUICK_ACTIONS_FEATURE, CHAT_FEATURE, TRANSLATE_FEATURE, REVIEW_FEATURE,
} from '../src/index.js';
import { OpenEditor } from '../../../packages/core/src/editor.js';

const ALLOW = { manager: { gate: () => ({ allowed: true, reason: 'granted' }) }, upgradeNotice: false };
const DENY = { manager: { gate: () => ({ allowed: false, reason: 'no-license' }) }, upgradeNotice: false };

function mockStream(chunks) {
  const enc = new TextEncoder();
  let i = 0;
  return vi.fn().mockResolvedValue({
    ok: true, status: 200,
    body: { getReader: () => ({ read: () => (i < chunks.length
      ? Promise.resolve({ done: false, value: enc.encode(chunks[i++]) })
      : Promise.resolve({ done: true })) }) },
    text: () => Promise.resolve(chunks.join('')),
  });
}

let target, editor;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, { aiEndpoint: 'https://ai.example/x' });
});
afterEach(() => {
  try { editor.destroy(); } catch { /* ignore */ }
  target.remove();
  document.querySelectorAll('.oe-wrapper').forEach((n) => n.remove());
  vi.restoreAllMocks();
});

function selectAll() {
  const el = editor.getEditorElement();
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  const sel = document.getSelection();
  sel.removeAllRanges(); sel.addRange(r);
}

describe('feature ids', () => {
  it('quick actions + chat map to their registry ids', () => {
    expect(QUICK_ACTIONS_FEATURE).toBe('ai.quickActions');
    expect(CHAT_FEATURE).toBe('ai.panel');
  });
});

describe('Quick Actions — granted', () => {
  it('installs, exposes editor.aiQuickAction + a toolbar button', () => {
    editor.plugins.install(createAiQuickActionsPlugin(ALLOW));
    expect(editor.plugins.isInstalled('ai-quick-actions')).toBe(true);
    expect(typeof editor.aiQuickAction).toBe('function');
    const btn = editor.plugins.get('ai-quick-actions').getToolbarButtons()[0];
    expect(btn).toMatchObject({ name: 'aiQuickActions' });
  });

  it('rewrite replaces the selection with the streamed AI text', async () => {
    editor.setHTML('<p>bad text</p>');
    editor.plugins.install(createAiQuickActionsPlugin(ALLOW));
    globalThis.fetch = mockStream(['data: {"delta":"Good text"}\n', 'data: [DONE]\n']);
    selectAll();
    await editor.aiQuickAction('rewrite');
    expect(editor.getHTML()).toContain('Good text');
    expect(editor.getHTML()).not.toContain('bad text');
  });

  it('sends the right prompt for the chosen action', async () => {
    editor.setHTML('<p>hello world</p>');
    editor.plugins.install(createAiQuickActionsPlugin(ALLOW));
    const f = mockStream(['data: [DONE]\n']);
    globalThis.fetch = f;
    selectAll();
    await editor.aiQuickAction('summarize');
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.prompt).toMatch(/summarize/i);
    expect(body.prompt).toContain('hello world');
  });

  it('no selection → emits aiError:no-selection, does not call fetch', async () => {
    editor.setHTML('<p>x</p>');
    editor.plugins.install(createAiQuickActionsPlugin(ALLOW));
    const f = vi.spyOn(globalThis, 'fetch');
    let reason = null;
    editor.on('aiError', (e) => { reason = e.reason; });
    // collapse selection (nothing selected)
    editor.getEditorElement().focus();
    await editor.aiQuickAction('rewrite');
    expect(reason).toBe('no-selection');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('Chat — granted', () => {
  it('installs, exposes editor.openAiChat + a read-only-exempt button', () => {
    editor.plugins.install(createAiChatPlugin(ALLOW));
    expect(editor.plugins.isInstalled('ai-chat')).toBe(true);
    expect(typeof editor.openAiChat).toBe('function');
    const btn = editor.plugins.get('ai-chat').getToolbarButtons()[0];
    expect(btn).toMatchObject({ name: 'aiChat', readOnlyExempt: true });
  });

  it('opening the chat renders the panel in a modal', () => {
    editor.plugins.install(createAiChatPlugin(ALLOW));
    editor.openAiChat();
    // the modal manager mounts the panel; find it in the DOM
    expect(document.querySelector('[data-oe-ai-chat]')).not.toBeNull();
  });
});

describe('Translate — granted', () => {
  it('feature id + installs + replaces selection with the translation', async () => {
    expect(TRANSLATE_FEATURE).toBe('ai.translate');
    editor.setHTML('<p>hello</p>');
    editor.plugins.install(createAiTranslatePlugin(ALLOW));
    expect(typeof editor.aiTranslate).toBe('function');
    const f = mockStream(['data: {"delta":"hola"}\n', 'data: [DONE]\n']);
    globalThis.fetch = f;
    selectAll();
    await editor.aiTranslate('Spanish');
    expect(editor.getHTML()).toContain('hola');
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.prompt).toMatch(/Spanish/);
  });
});

describe('Review — granted', () => {
  it('feature id + installs + exposes editor.aiReview', () => {
    expect(REVIEW_FEATURE).toBe('ai.review');
    editor.plugins.install(createAiReviewPlugin(ALLOW));
    expect(typeof editor.aiReview).toBe('function');
    const btn = editor.plugins.get('ai-review').getToolbarButtons()[0];
    expect(btn).toMatchObject({ name: 'aiReview' });
  });

  it('reviews the selection and shows suggestions in a panel', async () => {
    editor.setHTML('<p>teh cat sat</p>');
    editor.plugins.install(createAiReviewPlugin(ALLOW));
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, body: null,
      text: () => Promise.resolve('[{"original":"teh","suggestion":"the","reason":"typo"}]'),
    });
    selectAll();
    await editor.aiReview();
    const panel = document.querySelector('[data-oe-ai-review]');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('teh');
    expect(panel.textContent).toContain('the');
  });

  it('no selection → aiError:no-selection, no fetch (never reviews/flattens the whole doc)', async () => {
    editor.setHTML('<p>content but nothing selected</p>');
    editor.plugins.install(createAiReviewPlugin(ALLOW));
    const f = vi.spyOn(globalThis, 'fetch');
    let reason = null;
    editor.on('aiError', (e) => { reason = e.reason; });
    // no selection made
    await editor.aiReview();
    expect(reason).toBe('no-selection');
    expect(f).not.toHaveBeenCalled();
  });

  it('AI-2 — applying a review NEVER touches content outside the selection', async () => {
    // Doc has a heading + list that must survive; only the selected <p> changes.
    editor.setHTML('<h1>Keep Me</h1><p>teh cat</p><ul><li>keep item</li></ul>');
    editor.plugins.install(createAiReviewPlugin(ALLOW));
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, body: null,
      text: () => Promise.resolve('[{"original":"teh","suggestion":"the"}]'),
    });
    // Select only the paragraph text.
    const p = editor.getEditorElement().querySelector('p');
    const r = document.createRange(); r.selectNodeContents(p);
    const s = document.getSelection(); s.removeAllRanges(); s.addRange(r);
    await editor.aiReview();
    document.querySelector('[data-oe-ai-review] .oe-ai-review__btn--accept').click();
    document.querySelector('[data-oe-ai-review] .oe-ai-review__apply').click();
    const html = editor.getHTML();
    expect(html).toContain('<h1>Keep Me</h1>');        // heading preserved
    expect(html).toContain('keep item');                // list preserved
    expect(html).toContain('the cat');                  // fix applied
    expect(html).not.toContain('teh cat');
  });
});

describe('denied (graceful degrade)', () => {
  it('quick actions denied → no handle', () => {
    editor.plugins.install(createAiQuickActionsPlugin(DENY));
    expect(editor.plugins.isInstalled('ai-quick-actions')).toBe(true);
    expect(editor.aiQuickAction).toBeUndefined();
  });
  it('chat denied → no handle', () => {
    editor.plugins.install(createAiChatPlugin(DENY));
    expect(editor.openAiChat).toBeUndefined();
  });
  it('translate denied → no handle', () => {
    editor.plugins.install(createAiTranslatePlugin(DENY));
    expect(editor.aiTranslate).toBeUndefined();
  });
  it('review denied → no handle', () => {
    editor.plugins.install(createAiReviewPlugin(DENY));
    expect(editor.aiReview).toBeUndefined();
  });
});
