/**
 * src/index.d.ts — types for the runtime entry, re-exported from the package's
 * public declarations.
 *
 * Needed because `src/index.js` is plain JavaScript: without a declaration
 * beside it, a TypeScript consumer importing `./index.js` (as the Angular
 * component does) gets `any` for everything under --strict. The public surface
 * is still declared once, in the root index.d.ts — this only points at it.
 */
export * from '../index.js';
