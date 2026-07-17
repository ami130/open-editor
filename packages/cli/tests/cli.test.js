import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectFramework,
  detectPackageManager,
  packagesFor,
  installCommand,
} from '../src/detect.js';
import { starterFor, docsLineFor } from '../src/starters.js';
import { addEditor } from '../src/add.js';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-cli-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const writePkg = (deps = {}, devDeps = {}) =>
  writeFileSync(join(dir, 'package.json'),
    JSON.stringify({ dependencies: deps, devDependencies: devDeps }));

describe('detectFramework', () => {
  it('detects react', () => {
    writePkg({ react: '^19.0.0' });
    expect(detectFramework(dir)).toBe('react');
  });
  it('detects vue', () => {
    writePkg({}, { vue: '^3.5.0' });
    expect(detectFramework(dir)).toBe('vue');
  });
  it('prefers angular over stray react tooling', () => {
    writePkg({ '@angular/core': '^19.0.0' }, { react: '^19.0.0' });
    expect(detectFramework(dir)).toBe('angular');
  });
  it('falls back to vanilla with no package.json at all', () => {
    expect(detectFramework(dir)).toBe('vanilla');
  });
});

describe('detectPackageManager', () => {
  it('pnpm from pnpm-lock.yaml', () => {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(dir)).toBe('pnpm');
  });
  it('yarn from yarn.lock', () => {
    writeFileSync(join(dir, 'yarn.lock'), '');
    expect(detectPackageManager(dir)).toBe('yarn');
  });
  it('npm as the default', () => {
    expect(detectPackageManager(dir)).toBe('npm');
  });
});

describe('packagesFor + installCommand', () => {
  it('react gets engine + wrapper', () => {
    expect(packagesFor('react')).toEqual(['openeditor-text', 'openeditor-text-react']);
  });
  it('vanilla gets engine only', () => {
    expect(packagesFor('vanilla')).toEqual(['openeditor-text']);
  });
  it('npm uses install, others use add', () => {
    expect(installCommand('npm', ['a'])).toEqual(['npm', 'install', 'a']);
    expect(installCommand('pnpm', ['a', 'b'])).toEqual(['pnpm', 'add', 'a', 'b']);
  });
});

describe('starters', () => {
  it('every framework starter imports its own package', () => {
    expect(starterFor('react')).toContain("from 'openeditor-text-react'");
    expect(starterFor('vue')).toContain("from 'openeditor-text-vue'");
    expect(starterFor('angular')).toContain("from 'openeditor-text-angular'");
    expect(starterFor('vanilla')).toContain("from 'openeditor-text'");
  });
  it('docs line points at the installed wrapper', () => {
    expect(docsLineFor('vue')).toContain('openeditor-text-vue');
    expect(docsLineFor('vanilla')).toContain('openeditor-text');
  });
});

describe('addEditor (dry run)', () => {
  it('detects, skips install, prints starter', () => {
    writePkg({ react: '^19.0.0' });
    const lines = [];
    const code = addEditor('text', { cwd: dir, dryRun: true, log: (s) => lines.push(String(s)) });
    const out = lines.join('\n');
    expect(code).toBe(0);
    expect(out).toContain('react project');
    expect(out).toContain('openeditor-text + openeditor-text-react');
    expect(out).toContain("from 'openeditor-text-react'");
  });
  it('refuses unknown and unshipped editors', () => {
    const lines = [];
    expect(addEditor('image', { cwd: dir, dryRun: true, log: (s) => lines.push(String(s)) })).toBe(1);
    expect(lines.join('\n')).toContain('reserved');
    expect(addEditor('nope', { cwd: dir, dryRun: true, log: () => {} })).toBe(1);
  });
});
