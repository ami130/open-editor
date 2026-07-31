/**
 * openeditor-text-vue — TypeScript declarations. Types are REUSED from the
 * core package (OpenEditorConfig etc.) — zero type forks, mirroring the React
 * wrapper's declarations. Covers the two public entry points: the `OpenEditor`
 * component and the `useOpenEditor` composable.
 */
import type { DefineComponent, Ref } from 'vue';
import type {
  OpenEditor as OpenEditorInstance,
  OpenEditorConfig,
  OpenEditorTheme,
  OpenEditorDirection,
  EditorPlugin,
} from 'openeditor-text';

/** Reactive props. `config`/`plugins` are construct-time (remount via `:key`). */
export interface OpenEditorProps {
  /**
   * v-model content, and (controlled mode) external-change sync. Echoes of the
   * editor's own `update:modelValue` are ignored — the caret is never
   * disturbed by typing.
   */
  modelValue?: string;
  /** Reactive (applies live). */
  readOnly?: boolean;
  /** Reactive (applies live). */
  theme?: OpenEditorTheme | string;
  /** Reactive (applies live). */
  direction?: OpenEditorDirection;
  /** Construct-time: plugin instances installed on mount. Change via `:key` remount. */
  plugins?: EditorPlugin[];
  /** Construct-time editor config. Change via `:key` remount. */
  config?: OpenEditorConfig;
  /** Phase 2 — the license token. Reactive: changing it re-verifies in place
   *  (unlocks newly-granted premium without a remount). */
  licenseKey?: string | null;
  /** Phase 2 — the integrator's published ES256 public key(s), embedded at build. */
  licenseKeys?: Array<{ kid: string; jwk: JsonWebKey }> | null;
}

/** Events emitted by the component (kebab-idiomatic Vue emits). */
export interface OpenEditorEmits {
  (e: 'update:modelValue', html: string): void;
  (e: 'change', html: string, extra: { text: string; editor: OpenEditorInstance }): void;
  (e: 'ready', editor: OpenEditorInstance): void;
  (e: 'focus', event: unknown): void;
  (e: 'blur', event: unknown): void;
  (e: 'error', payload: { error: Error; context?: string }): void;
  /** Phase 2 — an invalid/failed license (bad key, wrong domain, expired). */
  (e: 'license-error', payload: { reason: string; message?: string }): void;
  /** Phase 2 — premium finished (async) loading. */
  (e: 'premium-ready', payload: { installed: string[] }): void;
}

/**
 * The instance exposed via a template ref (`ref="ed"` → `ed.value`). Vue's
 * expose proxy auto-unwraps the inner ref, so `editor` reads as the instance
 * (or null before mount / after unmount).
 */
export interface OpenEditorExposed {
  readonly editor: OpenEditorInstance | null;
  getHTML(): string;
  getMarkdown(): string;
  focus(): void;
}

/**
 * The `OpenEditor` Vue 3 component. Props carry the reactive inputs; the emits
 * (`OpenEditorEmits`) are wired in as the 8th `DefineComponent` generic so a
 * consumer's `@change` / `@ready` / `v-model` handlers are type-checked (not
 * left as the default `{}`).
 */
export const OpenEditor: DefineComponent<
  OpenEditorProps,
  object, // RawBindings
  object, // Data
  Record<string, never>, // Computed
  Record<string, never>, // Methods
  object, // Mixin
  object, // Extends
  OpenEditorEmits // Emits — makes @change/@ready/etc. typed for consumers
>;
export default OpenEditor;

/** Options accepted by the `useOpenEditor` composable. */
export interface UseOpenEditorOptions {
  /** Construct-time editor config. */
  config?: OpenEditorConfig;
  /** Plugin instances installed on mount. */
  plugins?: EditorPlugin[];
  /** Called once the editor is constructed and mounted. */
  onReady?: (editor: OpenEditorInstance) => void;
}

/**
 * Composition-API idiom: bring-your-own host element.
 *
 *   const host = ref<HTMLElement | null>(null);
 *   const { editor } = useOpenEditor(host, { config: { theme: 'dark' } });
 *
 * `editor` is a shallowRef — null until mounted, null again after unmount.
 * Lifecycle is bound to the calling component.
 */
export function useOpenEditor(
  hostRef: Ref<HTMLElement | null>,
  options?: UseOpenEditorOptions,
): { editor: Ref<OpenEditorInstance | null> };
