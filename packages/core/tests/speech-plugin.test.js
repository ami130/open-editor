/**
 * speech-plugin.test.js — dictation (speech-to-text) via the Web Speech API.
 *
 * jsdom has no SpeechRecognition, so we (a) prove GRACEFUL DEGRADATION with the
 * API absent (no button, no throw), and (b) inject a fake SpeechRecognition to
 * exercise the real flow: button appears, toggles listening, inserts recognized
 * text at the cursor, and tears down cleanly (mic released) on stop/destroy.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createSpeechPlugin, speechPlugin } from '../src/plugins/speech/speech-plugin.js';

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
});

const btns = (p) => p.getToolbarButtons();

/** A controllable fake SpeechRecognition matching the browser API surface. */
function installFakeSpeech() {
  const instances = [];
  class FakeRec {
    constructor() {
      this.continuous = false; this.interimResults = false; this.lang = '';
      this.started = false; this.stopped = false;
      this.onresult = null; this.onerror = null; this.onend = null;
      instances.push(this);
    }
    start() { if (this.started) throw new Error('already started'); this.started = true; }
    stop() { this.stopped = true; if (this.onend) this.onend(); }
    // test helper: simulate a finalized phrase from the provider. The browser
    // shape is: event.results[i].isFinal === true, event.results[i][0].transcript.
    _emit(transcript) {
      if (!this.onresult) return;
      const alt = { transcript };
      const result = { isFinal: true, 0: alt, length: 1 };
      this.onresult({ resultIndex: 0, results: { 0: result, length: 1 } });
    }
  }
  window.SpeechRecognition = FakeRec;
  return { instances };
}

describe('createSpeechPlugin — contract', () => {
  it('exposes the plugin contract', () => {
    const p = createSpeechPlugin();
    expect(p.name).toBe('speech');
    expect(typeof p.install).toBe('function');
    expect(typeof p.destroy).toBe('function');
    expect(typeof p.getToolbarButtons).toBe('function');
  });

  it('exports a shared singleton', () => {
    expect(speechPlugin.name).toBe('speech');
  });
});

describe('graceful degradation (no Web Speech API — e.g. Firefox)', () => {
  it('contributes NO toolbar button when the API is absent', () => {
    // jsdom has no SpeechRecognition by default.
    const p = createSpeechPlugin();
    p.install(editor);
    expect(btns(p)).toEqual([]); // no dead button
  });

  it('installs + destroys cleanly with the API absent (never throws)', () => {
    const p = createSpeechPlugin();
    expect(() => { editor.plugins.install(p); editor.plugins.uninstall('speech'); }).not.toThrow();
  });
});

describe('dictation flow (fake SpeechRecognition present)', () => {
  it('contributes one mic toggle button when the API exists', () => {
    installFakeSpeech();
    const p = createSpeechPlugin();
    p.install(editor);
    const list = btns(p);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('speech');
    expect(typeof list[0].onClick).toBe('function');
    expect(typeof list[0].isActive).toBe('function');
  });

  it('clicking starts listening; clicking again stops (and releases the mic)', () => {
    const { instances } = installFakeSpeech();
    const p = createSpeechPlugin();
    p.install(editor);
    const b = btns(p)[0];

    b.onClick();
    expect(b.isActive()).toBe(true);
    expect(instances[0].started).toBe(true);

    b.onClick();
    expect(b.isActive()).toBe(false);
    expect(instances[0].stopped).toBe(true); // mic released
  });

  it('a recognized phrase is inserted at the cursor', () => {
    const { instances } = installFakeSpeech();
    const p = createSpeechPlugin();
    p.install(editor);
    const before = editor.getHTML();
    btns(p)[0].onClick();          // start listening
    instances[0]._emit('hello world');
    const after = editor.getHTML();
    expect(after).toContain('hello world');
    expect(after).not.toBe(before);
  });

  it('emits afterCommand on start/stop (no new events — contract intact)', () => {
    installFakeSpeech();
    const p = createSpeechPlugin();
    p.install(editor);
    const seen = [];
    editor.on('afterCommand', (e) => { if (e.command === 'speech') seen.push(e.args[0]); });
    const b = btns(p)[0];
    b.onClick(); b.onClick();
    expect(seen).toContain('start');
    expect(seen).toContain('stop');
  });

  it('destroy() while listening stops recognition (mic never left open)', () => {
    const { instances } = installFakeSpeech();
    const p = createSpeechPlugin();
    editor.plugins.install(p);
    p.getToolbarButtons()[0].onClick(); // start
    expect(instances[0].started).toBe(true);
    editor.destroy();
    expect(instances[0].stopped).toBe(true);
  });

  it('a recognition error stops listening cleanly', () => {
    const { instances } = installFakeSpeech();
    const p = createSpeechPlugin();
    p.install(editor);
    const b = btns(p)[0];
    b.onClick();
    expect(b.isActive()).toBe(true);
    instances[0].onerror({ error: 'not-allowed' }); // e.g. permission denied
    expect(b.isActive()).toBe(false);
  });

  it('the mic button uses labelKey "speech" so its tooltip is translatable', () => {
    installFakeSpeech();
    const p = createSpeechPlugin();
    p.install(editor);
    expect(btns(p)[0].labelKey).toBe('speech');
  });

  it('a mic-blocked error surfaces a VISIBLE notice (not a silent no-op)', async () => {
    const { instances } = installFakeSpeech();
    const p = createSpeechPlugin();
    p.install(editor);
    btns(p)[0].onClick();
    instances[0].onerror({ error: 'not-allowed' });
    // A role=status chip is appended to the editor container with a helpful message.
    const container = editor.getContainer();
    const chip = container && container.querySelector('[role="status"]');
    expect(chip).toBeTruthy();
    expect(chip.textContent.toLowerCase()).toContain('microphone');
  });

  // AUDIT FIX: _insert() had no isReadOnly() guard — every other insert-plugin
  // in the codebase (bookmark/link/todo-list/hr/format-painter) checks this,
  // speech didn't. PROVEN before the fix: a recognized phrase landed in the
  // DOM even while the editor was readonly.
  it('a recognized phrase is NOT inserted while the editor is readonly', () => {
    const { instances } = installFakeSpeech();
    const p = createSpeechPlugin();
    p.install(editor);
    const before = editor.getHTML();
    btns(p)[0].onClick();
    editor.setReadOnly(true);
    instances[0]._emit('should not appear');
    expect(editor.getHTML()).toBe(before);
    editor.setReadOnly(false);
  });

  // AUDIT FIX: _insert() never called takeSnapshot() before mutating, so undo
  // granularity was an accident of default snapshot timing rather than a clean
  // per-phrase step (unlike emoji-plugin.js/special-chars-plugin.js, which both
  // explicitly snapshot before inserting). PROVEN before the fix: two dictated
  // phrases needed TWO separate undos to fully remove.
  it('each recognized phrase is its own clean undo step', () => {
    const { instances } = installFakeSpeech();
    const p = createSpeechPlugin();
    p.install(editor);
    btns(p)[0].onClick();
    instances[0]._emit('first phrase');
    const afterFirst = editor.getHTML();
    instances[0]._emit('second phrase');
    expect(editor.getHTML()).toContain('first phrase');
    expect(editor.getHTML()).toContain('second phrase');
    editor.undo();
    expect(editor.getHTML()).toBe(afterFirst);
    expect(editor.getHTML()).not.toContain('second phrase');
  });
});
