/**
 * `openeditors add <editor>` — detect the project, install the right
 * packages, print the starter code. v1 is deliberately small: detect →
 * install → print, no config mutation.
 */
import { spawnSync } from 'node:child_process';
import {
  detectFramework,
  detectPackageManager,
  packagesFor,
  installCommand,
} from './detect.js';
import { starterFor, docsLineFor } from './starters.js';

/** Editors the family ships today (each future editor is a new entry). */
const EDITORS = {
  text: { available: true },
  image: {
    available: false,
    note: 'openeditor-image is reserved — the image editor has not shipped yet.',
  },
};

export function addEditor(target, { cwd = process.cwd(), dryRun = false, log = console.log } = {}) {
  const editor = EDITORS[target];
  if (!editor) {
    log(`Unknown editor "${target}". Available: ${Object.keys(EDITORS).join(', ')}`);
    return 1;
  }
  if (!editor.available) {
    log(editor.note);
    return 1;
  }

  const framework = detectFramework(cwd);
  const pm = detectPackageManager(cwd);
  const packages = packagesFor(framework);
  const [cmd, ...args] = installCommand(pm, packages);

  log(`Detected: ${framework === 'vanilla' ? 'plain JavaScript' : framework} project, ${pm}.`);
  log(`Installing: ${packages.join(' + ')}\n`);

  if (!dryRun) {
    const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.status !== 0) {
      log(`\nInstall failed (${cmd} ${args.join(' ')} exited ${result.status ?? 'abnormally'}).`);
      log('Run it manually, then come back for the starter code with:');
      log(`  npx openeditors add ${target} --dry-run`);
      return result.status || 1;
    }
  }

  log('Done. Paste this to get a working editor:\n');
  log(starterFor(framework));
  log(`\n${docsLineFor(framework)}`);
  return 0;
}
