/**
 * Project detection for `openeditors add` — framework and package manager,
 * both read from the target directory (never global state). Pure functions;
 * the caller passes the directory so tests can point at fixtures.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Frameworks the CLI can wire up, in detection-precedence order. */
export const FRAMEWORKS = ['angular', 'react', 'vue', 'vanilla'];

/**
 * Read the project's package.json (returns {} when absent/unparseable —
 * a bare folder is a valid vanilla target).
 */
export function readPackageJson(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Detect the framework from dependencies + devDependencies.
 * Angular is checked first: Angular apps often carry react-adjacent tooling
 * in devDependencies, never the reverse.
 */
export function detectFramework(dir) {
  const pkg = readPackageJson(dir);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps['@angular/core']) return 'angular';
  if (deps.react) return 'react';
  if (deps.vue) return 'vue';
  return 'vanilla';
}

/** Detect the package manager from lockfiles; npm is the safe default. */
export function detectPackageManager(dir) {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'))) return 'bun';
  return 'npm';
}

/** The packages `add text` installs for a detected framework. */
export function packagesFor(framework) {
  const wrapper = {
    react: 'openeditor-text-react',
    vue: 'openeditor-text-vue',
    angular: 'openeditor-text-angular',
  }[framework];
  return wrapper ? ['openeditor-text', wrapper] : ['openeditor-text'];
}

/** The install argv for a package manager (all use `add` except npm). */
export function installCommand(pm, packages) {
  const verb = pm === 'npm' ? 'install' : 'add';
  return [pm, verb, ...packages];
}
