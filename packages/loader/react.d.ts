/**
 * @openeditors/loader/react — TypeScript declarations.
 *
 * Types are REUSED from the core package and from the loader's own
 * `LoaderOnlyOptions` — zero forks, the same rule the npm wrappers follow. A
 * new engine option therefore needs no change here to be visible.
 */
import type { ComponentType, CSSProperties, Ref } from 'react';
import type {
  OpenEditor as OpenEditorInstance,
  OpenEditorConfig,
  OpenEditorTheme,
  OpenEditorDirection,
} from 'openeditor-text';
import type { LoaderOnlyOptions, LoaderPlugins } from './index.js';

export interface OpenEditorHandle {
  /** The live core editor — null while the engine loads, and after unmount. */
  readonly editor: OpenEditorInstance | null;
  /** Why the engine failed to load, if it did. */
  readonly loadError: Error | null;
  getHTML(): string;
  getMarkdown(): string;
  focus(): void;
}

export interface OpenEditorProps
  extends Pick<
  LoaderOnlyOptions,
  'endpoint' | 'licenceKey' | 'licenseKey' | 'version' | 'installId' | 'cache' | 'fallback'
  > {
  /** Which plugins to install after mount. Default `'all'`. */
  plugins?: LoaderPlugins;

  /**
   * Initial content, and (controlled mode) external-change sync. Echoes of
   * your own onChange are ignored — the caret is never disturbed by typing.
   */
  value?: string;
  onChange?: (html: string, extra: { text: string; editor: OpenEditorInstance }) => void;
  /** Fired once the engine has downloaded AND mounted — not on the mount tick. */
  onReady?: (editor: OpenEditorInstance) => void;
  onFocus?: (e: unknown) => void;
  onBlur?: (e: unknown) => void;
  onError?: (payload: { error: Error; context?: string }) => void;
  onLicenseError?: (payload: { reason: string; message?: string }) => void;
  onPremiumReady?: (payload: { installed: string[] }) => void;
  /** Delivery-only: the ENGINE itself could not be loaded. */
  onLoadError?: (error: Error) => void;
  /** Result of a reactive `licenceKey` change. `reloadRequired` when the plan changed. */
  onLicenceApplied?: (result: { applied: boolean; plan: string; reloadRequired: boolean }) => void;

  /** Reactive. */
  readOnly?: boolean;
  /** Reactive. */
  theme?: OpenEditorTheme;
  /** Reactive. */
  direction?: OpenEditorDirection;

  /** Construct-time editor config. Change via a React `key` remount. */
  config?: OpenEditorConfig;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<OpenEditorHandle>;
}

export const OpenEditor: ComponentType<OpenEditorProps>;
export default OpenEditor;
