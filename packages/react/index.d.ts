/**
 * openeditor-text-react — TypeScript declarations. Types are REUSED from the
 * core package (OpenEditorConfig etc.) — zero type forks.
 */
import type { ComponentType, CSSProperties, Ref } from 'react';
import type {
  OpenEditor as OpenEditorInstance,
  OpenEditorConfig,
  OpenEditorTheme,
  OpenEditorDirection,
  EditorPlugin,
} from 'openeditor-text';

export interface OpenEditorHandle {
  /** The live core editor instance (null before mount / after unmount). */
  readonly editor: OpenEditorInstance | null;
  getHTML(): string;
  getMarkdown(): string;
  focus(): void;
}

export interface OpenEditorProps {
  /**
   * Initial content, and (controlled mode) external-change sync. Echoes of
   * your own onChange are ignored — the caret is never disturbed by typing.
   */
  value?: string;
  onChange?: (html: string, extra: { text: string; editor: OpenEditorInstance }) => void;
  onReady?: (editor: OpenEditorInstance) => void;
  onFocus?: (e: unknown) => void;
  onBlur?: (e: unknown) => void;
  onError?: (payload: { error: Error; context?: string }) => void;
  /** Reactive (applies live). */
  readOnly?: boolean;
  /** Reactive (applies live). */
  theme?: OpenEditorTheme | string;
  /** Reactive (applies live). */
  direction?: OpenEditorDirection;
  /** Construct-time: plugin instances installed on mount. Change via `key` remount. */
  plugins?: EditorPlugin[];
  /** Construct-time editor config. Change via `key` remount. */
  config?: OpenEditorConfig;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<OpenEditorHandle>;
}

export const OpenEditor: ComponentType<OpenEditorProps>;
export default OpenEditor;
