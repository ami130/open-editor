/**
 * @open-editor-hq/core — TypeScript declarations (17.3).
 *
 * HAND-AUTHORED against the frozen 1.0 public API. The frozen surface is
 * enforced at runtime by tests/api-contract.test.js; these declarations are
 * enforced against that same contract by tests/types/type-contract.test-d.ts
 * (a consumer-side compile check that runs in CI). If you change either side,
 * the other must change in the same commit — type drift fails the build
 * exactly like API drift.
 *
 * Scope note (matches the README freeze boundary): the core surface below is
 * FROZEN. `editor.plugins.*` and `editor.ui.*` are "stable from 1.x" — typed
 * here for completeness but subject to additive change in 1.x releases.
 */

// ─── Config ──────────────────────────────────────────────────────────────────

export type OpenEditorTheme = 'light' | 'dark' | 'minimal' | 'auto';
export type OpenEditorDirection = 'ltr' | 'rtl';

export interface OpenEditorLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** Optional always-on channel used for config warnings. */
  notify?(level: 'info' | 'warn' | 'error', message: string): void;
}

export interface AutosaveConfig {
  /** Only 'localStorage' is supported. */
  storage: 'localStorage';
  /** Storage key (default 'oe-draft'). A companion `<key>:ts` timestamp is written. */
  key?: string;
  /** Save interval in ms (default 30000). */
  interval?: number;
  /** Restore a saved draft on load (default true). */
  restore?: boolean;
}

export interface MentionsConfig {
  /** Async data provider for the @mentions plugin. */
  source: (query: string) => Promise<Array<{ id: string | number; label: string }>>;
}

export type OnChangeConfig =
  | ((payload: { html: string; text: string }) => void)
  | { handler: (payload: { html: string; text: string }) => void; debounce?: number }
  | { debounce: number };

/** One entry in the special-characters / emoji grids. */
export interface CharGridItem {
  ch: string;
  label?: string;
  cat?: string;
  keywords?: string[];
}

export interface ClassOption {
  value: string;
  label: string;
}

/**
 * Constructor options. Every key is optional; unknown keys are copied through
 * but warn via the config validator (never throw).
 */
export interface OpenEditorConfig {
  debug?: boolean;
  logger?: OpenEditorLogger | null;
  toolbar?: boolean | string[];
  statusBar?: boolean;
  readonly?: boolean;
  spellcheck?: boolean;
  autofocus?: boolean;
  iframe?: boolean;
  direction?: OpenEditorDirection;
  theme?: OpenEditorTheme;
  minHeight?: number | string | null;
  maxHeight?: number | string | null;
  height?: number | string | null;
  defaultContent?: string;
  placeholder?: string;
  /** Master sanitizer switch — leave true unless you fully trust all input. */
  sanitize?: boolean;
  /** Extra tags to keep (adds to the built-in safe set). */
  allowTags?: string[] | null;
  /** Extra attributes to keep, per tag: { tagName: ['attr', …] }. */
  allowAttributes?: Record<string, string[]> | null;
  /** Tags to strip even if otherwise allowed. */
  denyTags?: string[] | null;
  imageAllowDataUri?: boolean;
  imageDefaultWidth?: number | null;
  imageAvailableClasses?: ClassOption[] | null;
  imageOpenOnDblClick?: boolean;
  /**
   * POST endpoint for image uploads (multipart `file` field). Response:
   * `{ url }` (or `{ src }`), optionally `{ sources: [{ srcset, media?, type?,
   * sizes? }] }` to emit a responsive `<picture>` (every srcset scheme-checked).
   */
  imageUploadUrl?: string | null;
  tableAvailableClasses?: ClassOption[] | null;
  tableDefaultClass?: string | null;
  tableDefaultHeaderRow?: boolean;
  askBeforePasteHTML?: boolean;
  askBeforePasteFromWord?: boolean;
  defaultActionOnPaste?: 'keep' | 'clean' | 'text' | null;
  defaultActionOnPasteFromWord?: 'keep' | 'clean' | 'text' | null;
  pasteStripStyles?: boolean;
  specialCharacters?: CharGridItem[] | string[] | null;
  emojis?: CharGridItem[] | null;
  formatPainterSticky?: boolean;
  codeBlockLanguages?: string[] | null;
  sourceModeBeautify?: boolean;
  sourceModeHighlight?: boolean;
  maxLength?: number | null;
  autosave?: AutosaveConfig | null;
  onChange?: OnChangeConfig | null;
  /** Locale code ('en') or a partial translation map merged over the EN bundle. */
  locale?: string | Record<string, string>;
  inlineToolbar?: boolean;
  blockquoteToolbar?: boolean;
  /** Prompt before the tab closes while there are unsaved changes. */
  warnOnUnload?: boolean;
  /** Markdown-style typing shortcuts (**bold**, # heading, - list, …). */
  autoformat?: boolean;
  mentions?: MentionsConfig | null;
}

// ─── Events (frozen names + payload shapes) ──────────────────────────────────

export interface CancelableEvent {
  preventDefault(): void;
  defaultPrevented?: boolean;
}

export interface OpenEditorEventMap {
  beforeChange: CancelableEvent & { inputType?: string; data?: string | null };
  onChange: { html: string; text: string };
  beforeSetHTML: CancelableEvent & { html: string };
  setHTML: { html: string };
  reset: Record<string, never>;
  maxLengthExceeded: { maxLength: number };
  focus: unknown;
  blur: unknown;
  selectionChange: unknown;
  stateChange: { key: string; value: unknown };
  readOnlyChange: { readOnly: boolean };
  directionChange: { direction: OpenEditorDirection };
  themeChange: { theme: string };
  beforeCommand: CancelableEvent & { command: string; args: unknown[] };
  afterCommand: { command: string; args: unknown[] };
  undo: unknown;
  redo: unknown;
  beforePaste: CancelableEvent & { html?: string; text?: string };
  afterPaste: unknown;
  beforeInit: unknown;
  init: unknown;
  afterInit: unknown;
  ready: unknown;
  beforeDestroy: unknown;
  destroy: unknown;
  autosaveSaved: { key: string; savedAt: number | null };
  autosaveRestored: { key: string; html: string; savedAt: number | null };
  autosaveFailed: { key: string; error: Error };
  autosaveDraftSkipped: { key: string; html: string; savedAt: number | null };
  pluginInstalled: { name: string };
  pluginUninstalled: { name: string };
  error: { error: Error; context?: string };
}

export type OpenEditorEventName = keyof OpenEditorEventMap;

// ─── Selection / commands / shortcuts namespaces (frozen) ───────────────────

export interface SelectionInfo {
  /** Always a clone — never the live range. */
  range: Range;
  startNode: Node;
  startOffset: number;
  endNode: Node;
  endOffset: number;
  collapsed: boolean;
  commonAncestor: Node;
}

export interface SelectionNamespace {
  /** Current selection clamped to the editor, or null when outside/empty. */
  get(): SelectionInfo | null;
  /** Save a bookmark that survives DOM mutation. */
  save(): void;
  /** Restore the last saved bookmark. */
  restore(): void;
  /** Selected content as HTML ('' when collapsed). */
  getHTML(): string;
  /** Selected plain text ('' when collapsed). */
  getText(): string;
  selectAll(): void;
}

export interface CommandDescriptor {
  execute(editor: OpenEditor, ...args: unknown[]): unknown;
  isActive?(editor: OpenEditor): boolean;
  isEnabled?(editor: OpenEditor): boolean;
  getValue?(editor: OpenEditor): unknown;
}

export interface CommandsNamespace {
  /**
   * Runs a command through the full pipeline (beforeCommand/afterCommand,
   * readonly guard, selection save/restore, history). Returns a success
   * BOOLEAN — never the command's own return value; expose readable state
   * through your plugin's API instead.
   */
  execute(name: string, ...args: unknown[]): boolean;
  isActive(name: string): boolean;
  isEnabled(name: string): boolean;
  getAll(): Map<string, Required<CommandDescriptor>>;
  register(name: string, descriptor: CommandDescriptor): CommandsNamespace;
}

export interface ShortcutDescriptor {
  keys: string;
  command: string;
  label: string;
}

export interface ShortcutsNamespace {
  /**
   * Bind e.g. 'mod+shift+k' to a command NAME. On match the editor emits a
   * `'shortcut'` event with the descriptor — it does NOT auto-execute the
   * command; listen via `editor.on('shortcut', ({ command }) => …)`.
   */
  register(keys: string, command: string, label?: string): ShortcutsNamespace;
  unregister(keys: string): void;
  getAll(): Map<string, ShortcutDescriptor>;
}

// ─── Plugins / UI namespaces (stable from 1.x, NOT frozen) ──────────────────

export interface ToolbarButtonDescriptor {
  name: string;
  type: 'button' | 'dropdown' | string;
  icon?: string;
  tooltip?: string;
  onClick?: () => void;
  [key: string]: unknown;
}

export interface EditorPlugin {
  name: string;
  install(editor: OpenEditor): void;
  destroy?(): void;
  getToolbarButtons?(): ToolbarButtonDescriptor[];
  onKeyDown?(e: KeyboardEvent): boolean | void;
  [key: string]: unknown;
}

export interface PluginsNamespace {
  install(plugin: EditorPlugin | string): void;
  uninstall(name: string): void;
  get(name: string): EditorPlugin | undefined;
  getAll(): Map<string, EditorPlugin>;
  register?(plugin: EditorPlugin): void;
}

export interface ModalOptions {
  title?: string;
  /** HTML string or element. Treated as a raw sink — sanitize your own input. */
  body?: string | HTMLElement;
  buttons?: Array<{ label: string; onClick?: () => void; primary?: boolean }>;
  [key: string]: unknown;
}

export interface UiNamespace {
  modal: { open(opts: ModalOptions): void; close(): void; [key: string]: unknown };
  tooltip: { show(target: HTMLElement, text: string): void; hide(): void; [key: string]: unknown };
  contextMenu: {
    show(x: number, y: number, items: Array<{ label: string; onClick?: () => void }>): void;
    hide(): void;
    [key: string]: unknown;
  };
}

// ─── Content JSON shape ──────────────────────────────────────────────────────

export interface EditorJSON {
  version: string;
  content: Array<{ type: string; html: string }>;
}

// ─── The editor (frozen instance surface) ────────────────────────────────────

export class OpenEditor {
  constructor(target: string | HTMLElement, config?: OpenEditorConfig);

  // content
  getHTML(): string;
  setHTML(html: string): void;
  getText(): string;
  getJSON(): EditorJSON;
  setJSON(json: EditorJSON): void;
  isEmpty(): boolean;
  getWordCount(): number;
  getCharCount(): number;

  // state
  focus(): void;
  blur(): void;
  enable(): void;
  disable(): void;
  setReadOnly(readOnly: boolean): void;
  isReadOnly(): boolean;
  setTheme(theme: OpenEditorTheme | string): void;
  getTheme(): string;
  setCSSVar(name: string, value: string): void;
  getCSSVar(name: string): string;
  setDirection(direction: OpenEditorDirection): void;
  getDirection(): string;
  toggleFullscreen(): void;
  isFullscreen(): boolean;
  print(): void;
  /** Re-render from the last clean snapshot (crash recovery). */
  reset(): boolean;
  destroy(): void;

  // history
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;

  // events — typed for frozen names, open for plugin/raw-DOM pass-through names
  on<K extends OpenEditorEventName>(event: K, handler: (payload: OpenEditorEventMap[K]) => void): void;
  on(event: string, handler: (payload: unknown) => void): void;
  off<K extends OpenEditorEventName>(event: K, handler: (payload: OpenEditorEventMap[K]) => void): void;
  off(event: string, handler: (payload: unknown) => void): void;
  once<K extends OpenEditorEventName>(event: K, handler: (payload: OpenEditorEventMap[K]) => void): void;
  once(event: string, handler: (payload: unknown) => void): void;
  emit(event: string, payload?: unknown): void;

  // introspection
  getContainer(): HTMLElement;
  getEditorElement(): HTMLElement;
  getVersion(): string;
  isDestroyed(): boolean;

  // namespaces
  readonly selection: SelectionNamespace;
  readonly commands: CommandsNamespace;
  readonly shortcuts: ShortcutsNamespace;
  /** Stable from 1.x (not frozen). */
  readonly plugins: PluginsNamespace;
  /** Stable from 1.x (not frozen). */
  readonly ui: UiNamespace;
  readonly history: { takeSnapshot(): void; clear(): void; [key: string]: unknown };
}

// ─── Package exports ─────────────────────────────────────────────────────────

export const VERSION: string;

/** Sanitize an HTML string with the editor's sanitizer. */
export function sanitize(html: string, options?: {
  document?: Document;
  allowTags?: string[] | null;
  allowAttributes?: Record<string, string[]> | null;
  denyTags?: string[] | null;
}): string;
export function normalizeEncoding(html: string): string;
export function normalizeStructure(root: Element): void;
export function normalizeTextNodes(root: Element): void;

export function debounce<T extends (...args: never[]) => unknown>(
  fn: T, wait: number
): T & { cancel(): void };

// Selection / DOM helpers
export function walkUp(node: Node, predicate: (n: Node) => boolean, stopAt?: Node): Node | null;
export function getClosestTag(node: Node, tagName: string, stopAt?: Node): Element | null;
export function getParentBlock(node: Node, root: Element): Element | null;
export function isInsideTag(node: Node, tagName: string, stopAt?: Node): boolean;
export function getDeepestNode(el: Node): Node;

// Clipboard helpers
export function copyToClipboard(text: string): Promise<boolean>;
export function getClipboardText(e: ClipboardEvent): string;
export function isClipboardApiAvailable(): boolean;

// Infrastructure classes (typed loosely — internals are not part of the freeze)
export class EventEmitter {
  on(event: string, handler: (payload: unknown) => void): void;
  off(event: string, handler: (payload: unknown) => void): void;
  once(event: string, handler: (payload: unknown) => void): void;
  emit(event: string, payload?: unknown): void;
}
export class Logger implements OpenEditorLogger {
  constructor(options?: { debug?: boolean; custom?: OpenEditorLogger | null });
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  notify(level: 'info' | 'warn' | 'error', message: string): void;
}
export class ShortcutManager { [key: string]: unknown }
export class EditorState { [key: string]: unknown }
export class SelectionManager { [key: string]: unknown }
export class CommandManager { [key: string]: unknown }
export class HistoryManager { [key: string]: unknown }
export class ModalManager { [key: string]: unknown }
export class TooltipManager { [key: string]: unknown }
export class ContextMenuManager { [key: string]: unknown }
export class PluginManager { [key: string]: unknown }

/**
 * Test harness (jsdom-oriented) — creates a disposable editor on its own
 * auto-appended target element. Caller tears down with
 * `editor.destroy(); editor.getContainer().remove();`.
 */
export function createTestEditor(config?: OpenEditorConfig): OpenEditor;

// ─── Plugin factories (one per shipped plugin; each returns a fresh instance) ─

export function createImagePlugin(): EditorPlugin;
export function createLinkPlugin(): EditorPlugin;
export function createTablePlugin(): EditorPlugin;
export function createSpellcheckPlugin(): EditorPlugin;
export function createSpecialCharsPlugin(): EditorPlugin;
export function createEmojiPlugin(): EditorPlugin;
export function createPreviewPlugin(): EditorPlugin;
export function createFormatPainterPlugin(): EditorPlugin;
export function createResizeEditorPlugin(): EditorPlugin;
export function createFindReplacePlugin(): EditorPlugin;
export function createMediaPlugin(): EditorPlugin;
export function createCodeBlockPlugin(): EditorPlugin;
export function createSourcePlugin(): EditorPlugin;
export function createSlashCommandPlugin(): EditorPlugin;
export function createAutoformatPlugin(): EditorPlugin;
export function createMentionsPlugin(): EditorPlugin;
export function createBlockDragPlugin(): EditorPlugin;
export function createTodoListPlugin(): EditorPlugin;

// Legacy shared plugin singletons (prefer the create* factories above).
export const imagePlugin: EditorPlugin;
export const linkPlugin: EditorPlugin;
export const tablePlugin: EditorPlugin;
export const spellcheckPlugin: EditorPlugin;
export const specialCharsPlugin: EditorPlugin;
export const emojiPlugin: EditorPlugin;
export const previewPlugin: EditorPlugin;
export const formatPainterPlugin: EditorPlugin;
export const resizeEditorPlugin: EditorPlugin;
export const findReplacePlugin: EditorPlugin;
export const mediaPlugin: EditorPlugin;
export const codeBlockPlugin: EditorPlugin;
export const sourcePlugin: EditorPlugin;
export const slashCommandPlugin: EditorPlugin;
export const autoformatPlugin: EditorPlugin;
export const mentionsPlugin: EditorPlugin;
export const blockDragPlugin: EditorPlugin;
export const todoListPlugin: EditorPlugin;

// ─── UI locale packs (17.11) ─────────────────────────────────────────────────
// Complete translations of the toolbar/dialog/status UI. Pass to the
// constructor: `new OpenEditor('#app', { locale: localeEs })`. Also available
// as NAMED subpath imports: `import { es } from '@open-editor-hq/core/locales/es'`.
export const localeEs: Record<string, string>;
export const localeFr: Record<string, string>;
export const localeDe: Record<string, string>;
export const localeAr: Record<string, string>;
