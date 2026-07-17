# Writing a Plugin for Open Editor

This guide shows how to build, test, and publish a third-party plugin against
the published package (`openeditor-text`). Everything here uses only the
public API — the worked example below is verified in CI against the live npm
release.

## The plugin contract

A plugin is a plain object (or a factory returning one):

```js
const myPlugin = {
  name: 'my-plugin',          // required, unique
  install(editor) { … },      // required — wire everything up here
  destroy() { … },            // optional — undo EVERYTHING install did
  getToolbarButtons() { … },  // optional — contribute toolbar buttons
  onKeyDown(e) { … },         // optional — return true to consume the event
};

editor.plugins.install(myPlugin);
```

Rules the editor enforces (and you should design for):

- **`install` runs once per editor instance.** Keep per-instance state on the
  plugin object (`this._editor = editor`), never in module scope — module
  scope is shared between instances. Ship a **factory** (`createMyPlugin()`)
  so each instance gets fresh state.
- **`destroy` must be a true inverse of `install`.** Remove listeners, DOM
  nodes, timers. The editor calls it on `editor.destroy()` and on uninstall.
  A leaky plugin fails host applications that create/destroy editors
  repeatedly (the core has a 100-cycle leak test; hold yourself to the same).
- **Errors are isolated but not silenced** — if `install` throws, the editor
  logs it, calls your `destroy()` for cleanup, and continues without you.

## Worked example: a "word goal" plugin

A toolbar chip that live-tracks the word count against a configurable goal
and celebrates when you reach it. It exercises the surfaces most plugins
need: factory options, events, a toolbar button, a registered command, a
keyboard shortcut, injected styles, and clean teardown.

```js
// word-goal-plugin.js
export function createWordGoalPlugin({ goal = 100 } = {}) {
  return {
    name: 'word-goal',
    _editor: null,
    _chip: null,
    _styleEl: null,
    _onUpdate: null,

    install(editor) {
      this._editor = editor;

      // 1. Styles — plain <style> tag, removed in destroy(). (The core's own
      //    injector is internal API; third-party plugins own their styles.)
      this._styleEl = document.createElement('style');
      this._styleEl.textContent = `
        .wg-chip { margin-left: 8px; padding: 2px 10px; border-radius: 999px;
                   font: 600 12px/1.6 system-ui; background: var(--oe-panel-bg);
                   color: var(--oe-panel-fg); border: 1px solid var(--oe-border); }
        .wg-chip--met { background: var(--oe-primary); color: #fff; }
      `;
      document.head.appendChild(this._styleEl);

      // 2. A command — commands perform ACTIONS. Note: `commands.execute()`
      //    returns a success BOOLEAN, never your execute()'s return value —
      //    expose readable state as a method on the plugin instead (see
      //    getReport below), and keep commands for doing things.
      editor.commands.register('wordGoalReport', {
        execute: (ed) => {
          const r = this.getReport();
          ed.ui.tooltip.show(this._chip, `${r.words} / ${r.goal} words`);
          // Track the timer — an untracked setTimeout outlives destroy() and
          // crashes on the editor's nulled accessors (found the hard way:
          // this exact line, without the guard, failed the guide's own
          // verification 1.2s after the test's destroy()).
          clearTimeout(this._tipTimer);
          this._tipTimer = setTimeout(() => {
            if (this._editor) this._editor.ui.tooltip.hide();
          }, 1200);
        },
      });

      // 3. A shortcut. register(keys, commandName, label) stores a binding;
      //    when it matches, the editor emits a 'shortcut' event (it does NOT
      //    auto-execute) — your plugin decides what happens. Keep the handler
      //    reference for destroy().
      editor.shortcuts.register('mod+shift+g', 'wordGoalReport', 'Word goal');
      this._onShortcut = ({ command }) => {
        if (command === 'wordGoalReport') editor.commands.execute('wordGoalReport');
      };
      editor.on('shortcut', this._onShortcut);

      // 4. Live updates — subscribe to semantic events; keep the handler
      //    reference so destroy() can unsubscribe the SAME function.
      this._onUpdate = () => this._render();
      editor.on('onChange', this._onUpdate);
      editor.on('setHTML', this._onUpdate);

      // 5. The chip lives in the status bar area of the wrapper.
      this._chip = document.createElement('span');
      this._chip.className = 'wg-chip';
      editor.getContainer().querySelector('.oe-statusbar')?.appendChild(this._chip);
      this._render();
    },

    /** Public read API for host apps (commands can't return values). */
    getReport() {
      const words = this._editor ? this._editor.getWordCount() : 0;
      return { words, goal, met: words >= goal };
    },

    _render() {
      if (!this._chip || !this._editor) return;
      const { words, met } = this.getReport();
      this._chip.textContent = `${words}/${goal}`;
      this._chip.classList.toggle('wg-chip--met', met);
    },

    destroy() {
      const ed = this._editor;
      if (ed) {
        ed.off('onChange', this._onUpdate);
        ed.off('setHTML', this._onUpdate);
        ed.off('shortcut', this._onShortcut);
        ed.shortcuts.unregister('mod+shift+g');
      }
      clearTimeout(this._tipTimer);
      this._chip?.remove();
      this._styleEl?.remove();
      this._editor = this._chip = this._styleEl = this._onUpdate = this._onShortcut = null;
    },
  };
}
```

Use it:

```js
import { OpenEditor } from 'openeditor-text';
import { createWordGoalPlugin } from './word-goal-plugin.js';

const editor = new OpenEditor('#app');
editor.plugins.install(createWordGoalPlugin({ goal: 50 }));
```

## Toolbar buttons

Return descriptors from `getToolbarButtons()`; the toolbar renders them after
the built-in groups:

```js
getToolbarButtons() {
  return [{
    name: 'myButton',                 // becomes data-name="myButton"
    type: 'button',
    icon: '<svg …aria-hidden="true">…</svg>',
    tooltip: 'Do the thing',
    onClick: () => this._editor.commands.execute('myCommand'),
  }];
}
```

Give every icon `aria-hidden="true"` and rely on `tooltip` for the accessible
name — the toolbar wires `aria-label` from it.

## Commands, events, and what to rely on

- **Register commands** (`editor.commands.register(name, { execute, isActive?,
  isEnabled?, getValue? })`) rather than calling private methods — commands
  participate in `beforeCommand`/`afterCommand` (cancelable), history
  snapshots, and toolbar state.
- **Subscribe to the frozen events** (`onChange`, `setHTML`, `selectionChange`,
  `afterCommand`, `destroy`, …) — their names and payloads are contract-tested
  and safe to build on. Event names outside the frozen list may change in 1.x.
- **Read content via `getHTML()/getText()/getJSON()`**, never by walking the
  editor's DOM and caching nodes across edits — `setHTML`/undo replace the DOM
  wholesale, and stale node references are the #1 plugin bug class.
- **Sanitizer:** anything your plugin inserts must survive the round-trip. If
  you insert custom attributes/tags, they must be in the allowlist — test with
  `editor.setHTML(editor.getHTML())` and check nothing was stripped.

## Testing your plugin

The package exports the same jsdom harness the core's 1,969 unit tests use:

```js
import { describe, it, expect } from 'vitest';
import { createTestEditor } from 'openeditor-text';
import { createWordGoalPlugin } from '../word-goal-plugin.js';

describe('word-goal', () => {
  it('counts toward the goal and cleans up', () => {
    const editor = createTestEditor();   // creates its own target in jsdom
    const plugin = createWordGoalPlugin({ goal: 3 });
    editor.plugins.install(plugin);
    editor.setHTML('<p>one two three</p>');
    expect(plugin.getReport()).toEqual({ words: 3, goal: 3, met: true });
    expect(editor.commands.execute('wordGoalReport')).toBe(true); // success boolean
    const target = editor.getContainer(); // grab BEFORE destroy — the editor
    editor.destroy();                     // nulls its accessors post-destroy
    target.remove();                      // remove the harness target
  });
});
```

Test the destroy path explicitly: install → destroy → assert your DOM nodes,
listeners, and styles are gone. Then test in a real browser — jsdom does not
fire real selections, IME, or clipboard events.

## Publishing your plugin

- **Name:** `open-editor-plugin-<thing>` (searchable convention).
- **Peer dependency, not dependency:**
  ```json
  { "peerDependencies": { "openeditor-text": ">=1.1.0" } }
  ```
  so your users' bundler dedupes to their editor instance.
- **Ship a factory** as your main export; document its options.
- **State your surface:** if you only use frozen APIs + `plugins`/`ui`
  namespaces (stable from 1.x), declare compatibility with `1.x`.

## Checklist before you publish

- [ ] Factory export; no shared module-scope state
- [ ] `destroy()` removes every listener, node, style, timer
- [ ] Inserted markup survives `setHTML(getHTML())`
- [ ] Toolbar icons `aria-hidden`, buttons get tooltips
- [ ] Unit tests on `createTestEditor` + one real-browser smoke
- [ ] `peerDependencies` on `openeditor-text`
