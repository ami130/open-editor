#!/usr/bin/env node
/**
 * openeditors — the Open Editor family CLI.
 *
 *   npx openeditors add text        one command → a working rich text editor
 *   npm i -g openeditors            → the global `openeditor` command
 */
import { createRequire } from 'node:module';
import { addEditor } from '../src/add.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const HELP = `openeditors ${version} — the Open Editor family CLI

Usage:
  npx openeditors add text        add the rich text editor to this project
  openeditors add <editor>        editors: text (image: reserved)

Options:
  --dry-run     detect + print starter code without installing
  -v, --version print the CLI version
  -h, --help    this help

What \`add text\` does:
  1. Detects your framework (React / Vue / Angular / plain JS) from package.json
  2. Detects your package manager (npm / pnpm / yarn / bun) from the lockfile
  3. Installs openeditor-text plus the matching framework wrapper
  4. Prints ready-to-paste starter code for exactly your setup`;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('-')));
const words = args.filter((a) => !a.startsWith('-'));

if (flags.has('-v') || flags.has('--version')) {
  console.log(version);
  process.exit(0);
}

if (words[0] === 'add' && words[1]) {
  process.exit(addEditor(words[1], { dryRun: flags.has('--dry-run') }));
}

console.log(HELP);
process.exit(words.length === 0 || flags.has('-h') || flags.has('--help') ? 0 : 1);
