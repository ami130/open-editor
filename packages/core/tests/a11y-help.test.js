/**
 * 17.5.5 — Alt+0 accessibility help dialog: registry-driven rows, platform
 * dedupe, locale-aware labels, readonly-exempt, modal opens/closes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { collectShortcutRows } from '../src/ui/a11y-help-dialog.js';
import { resolveLocale } from '../src/ui/toolbar/locale.js';
import { es } from '../src/locales/es.js';

let editor, target;
function make(config = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, config);
  return editor;
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
  document.querySelectorAll('.oe-modal-backdrop, .oe-modal').forEach((n) => n.remove());
});

describe('17.5.5 — accessibility help', () => {
  it('collects deduped rows from the live registry', () => {
    make();
    const rows = collectShortcutRows(editor, resolveLocale('en'));
    const labels = rows.map((r) => r.label);
    expect(labels).toContain('Bold');
    expect(labels).toContain('Undo');
    // ctrl+/meta+ twins are deduped — exactly one Bold row.
    expect(labels.filter((l) => l === 'Bold')).toHaveLength(1);
  });

  it('labels prefer the locale bundle (command-name keys)', () => {
    make();
    const rows = collectShortcutRows(editor, resolveLocale(es));
    expect(rows.map((r) => r.label)).toContain('Negrita');
  });

  it('third-party registrations appear automatically', () => {
    make();
    editor.commands.register('zap', { execute() {} });
    editor.shortcuts.register('ctrl+shift+9', 'zap', 'Zap it');
    editor.shortcuts.register('meta+shift+9', 'zap', 'Zap it');
    const rows = collectShortcutRows(editor, resolveLocale('en'));
    expect(rows.filter((r) => r.label === 'Zap it')).toHaveLength(1);
  });

  it('the command opens a modal with a shortcuts table, even in readonly', async () => {
    make();
    editor.setReadOnly(true);
    editor.commands.execute('accessibilityHelp');
    // The open is deferred one tick (the command pipeline's selection restore
    // would otherwise steal focus from the modal).
    await new Promise((r) => setTimeout(r, 0));
    const table = document.querySelector('.oe-a11y-help__table');
    expect(table).toBeTruthy();
    expect(table.textContent).toContain('Bold');
    expect(document.querySelectorAll('.oe-a11y-help kbd').length).toBeGreaterThan(5);
  });
});
