/**
 * feature-catalog-coverage.test.js — Phase 1 guard (hardened).
 *
 * Proves the feature catalog + mapping is EXHAUSTIVE against the REAL editor, so
 * gating can never silently leak. Unlike a source-regex (which only saw
 * setup-commands.js and missed commands registered by helper/plugin files), this
 * builds a LIVE editor and inspects its actual command registry + the real UI
 * primitive lists (toolbar, bubble, slash, autoformat). If any primitive is
 * unmapped AND not always-on, this fails — that primitive would stay usable when
 * its feature isn't licensed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { featureForCommand, featureForToolbarItem } from '../src/entitlements/feature-catalog.js';
import { ALWAYS_ON } from '../src/entitlements/feature-gate.js';
import { DEFAULT_TOOLBAR } from '../src/ui/toolbar/toolbar-config.js';
import { BUBBLE_ITEMS } from '../src/ui/toolbar/inline-toolbar.js';
import { SLASH_COMMANDS } from '../src/plugins/slash-command/slash-command-data.js';
import { BLOCK_PATTERNS, INLINE_MARKERS } from '../src/plugins/autoformat/autoformat-patterns.js';
import * as pkg from '../src/index.js';

let target; let editor;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target);
  // Install EVERY first-party plugin so their registered commands enter the live
  // registry and get coverage-checked too (default grant-all → all install).
  // Without this the guard only saw core commands and missed plugin ones
  // (e.g. bookmark's insertBookmark/removeBookmark) — the audit's blind spot.
  for (const key of Object.keys(pkg)) {
    if (/^create[A-Za-z]+Plugin$/.test(key) && typeof pkg[key] === 'function') {
      try { editor.plugins.install(pkg[key]()); } catch { /* skip plugins needing config */ }
    }
  }
});
afterEach(() => { editor && editor.destroy && editor.destroy(); target.remove(); });

/** A command name is "covered" if it maps to a feature or is always-on core. */
const covered = (name) => !!featureForCommand(name) || ALWAYS_ON.has(name);

describe('Phase 1 — catalog covers every LIVE editor command', () => {
  it('every registered command maps to a feature OR is always-on', () => {
    // Read the live registry (catches commands from ANY source file/plugin).
    const names = [...editor.commands._commands.keys()];
    expect(names.length).toBeGreaterThan(40);
    const unmapped = names.filter((n) => !covered(n));
    expect(unmapped, `unmapped commands (add to feature-catalog or ALWAYS_ON):\n${unmapped.join('\n')}`).toEqual([]);
  });

  it('every DEFAULT_TOOLBAR item maps to a feature, or its command is always-on', () => {
    const items = [];
    for (const group of DEFAULT_TOOLBAR) {
      for (const item of group) {
        const name = typeof item === 'string' ? item : item && item.name;
        if (name) items.push(name);
      }
    }
    // A toolbar item is fine if the item name maps, OR it's an always-on control
    // (undo/redo/removeFormat render but are never gated).
    const unmapped = items.filter((n) => !featureForToolbarItem(n) && !ALWAYS_ON.has(n));
    expect(unmapped, `unmapped toolbar items:\n${unmapped.join('\n')}`).toEqual([]);
  });

  it('every SECONDARY-surface command is covered (bubble, slash, autoformat)', () => {
    // These surfaces gate at runtime via featureForCommand — a new entry
    // pointing at an unmapped command would leak silently. Assert them all here.
    const cmds = [
      ...BUBBLE_ITEMS.map((i) => i.command),
      ...SLASH_COMMANDS.map((s) => s.command),
      ...BLOCK_PATTERNS.map((p) => p.command),
      ...INLINE_MARKERS.map((m) => m.command),
    ].filter(Boolean);
    const unmapped = [...new Set(cmds)].filter((c) => !covered(c));
    expect(unmapped, `unmapped bubble/slash/autoformat commands:\n${unmapped.join('\n')}`).toEqual([]);
  });
});
