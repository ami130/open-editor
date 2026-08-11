/**
 * @openeditors/loader/vue — TypeScript declarations.
 *
 * Types are REUSED from the core package and the loader's own options — zero
 * forks, matching the npm wrappers.
 */
import type { DefineComponent, Ref, ShallowRef } from 'vue';
import type {
  OpenEditor as OpenEditorInstance,
  OpenEditorConfig,
} from 'openeditor-text';
import type { LoaderOnlyOptions, LoaderPlugins } from './index.js';

export interface UseOpenEditorOptions
  extends Partial<Pick<
  LoaderOnlyOptions,
  'licenceKey' | 'licenseKey' | 'version' | 'installId' | 'cache' | 'fallback'
  >> {
  endpoint: string;
  plugins?: LoaderPlugins;
  config?: OpenEditorConfig;
  onReady?: (editor: OpenEditorInstance) => void;
  onLoadError?: (error: Error) => void;
}

export interface UseOpenEditorResult {
  /** null until the engine has downloaded AND mounted; null again after unmount. */
  editor: ShallowRef<OpenEditorInstance | null>;
  loadError: ShallowRef<Error | null>;
}

/** Composition-API idiom: bring your own element. */
export function useOpenEditor(
  hostRef: Ref<HTMLElement | null>,
  options: UseOpenEditorOptions,
): UseOpenEditorResult;

export const OpenEditor: DefineComponent<{
  endpoint: string;
  licenceKey?: string;
  licenseKey?: string;
  version?: string;
  installId?: string;
  cache?: boolean;
  fallback?: boolean | string;
  plugins?: LoaderPlugins;
  modelValue?: string;
  readOnly?: boolean;
  theme?: string;
  direction?: 'ltr' | 'rtl';
  config?: OpenEditorConfig;
}>;

export default OpenEditor;
