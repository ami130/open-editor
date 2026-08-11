/**
 * @openeditors/loader — TypeScript declarations (execution plan §1.5 stage 4).
 *
 * ─── THE ONE RULE HERE: NO TYPE FORKS ───────────────────────────────────────
 * Under runtime delivery the engine is constructed by the LOADER, not by the
 * host app — so every editor option now travels host → loader → engine. If
 * these declarations re-listed those options, TypeScript users would get
 * autocomplete from a copy that silently drifts out of date, and every new
 * engine option would need a loader release to become visible (exactly what
 * T16 forbids).
 *
 * So `LoaderOptions` EXTENDS `OpenEditorConfig` from the core package. Loader
 * options are additive; everything else is the editor's own surface, typed once
 * at its source. This mirrors what the React/Vue/Angular wrappers already do.
 */
import type { OpenEditor, OpenEditorConfig, EditorPlugin } from 'openeditor-text';

// ─── Loader-only options ─────────────────────────────────────────────────────

/**
 * Which plugins to install after mount (B3).
 *
 * `'all'` (default) matches what an npm consumer gets today, so the editor is
 * fully featured with zero configuration. An array selects a subset; `[]` opts
 * out entirely. All plugins are in the delivered bundle either way — this
 * decides behaviour, not payload.
 */
export type LoaderPlugins = 'all' | Array<EditorPlugin | (() => EditorPlugin)>;

export interface LoaderOnlyOptions {
  /**
   * Delivery API origin, e.g. `https://delivery.yourdomain.com` — the only
   * REQUIRED loader option. Bundle URLs are resolved against it, so a relative
   * path returned by `/session` still reaches us rather than the host's own
   * server.
   */
  endpoint: string;

  /**
   * Licence key unlocking premium. Absent → the free tier, which needs no key,
   * no signup, and no account.
   *
   * Both spellings are accepted; `licenseKey` is the editor's historical
   * spelling and is kept so integrators need not remember which is which.
   */
  licenceKey?: string | null;
  /** @see licenceKey */
  licenseKey?: string | null;

  /**
   * Pin a specific engine version. Honoured only when the licence carries no
   * pin of its own — a customer cannot escape an admin's deliberate pinning by
   * asking for another build.
   */
  version?: string | null;

  /**
   * Override the anonymous install identifier (T18). Normally omitted: the
   * loader generates and persists one per browser profile.
   */
  installId?: string | null;

  /** Which plugins to install after mount. Default `'all'`. */
  plugins?: LoaderPlugins;

  /**
   * Cache the downloaded engine in IndexedDB so return visits mount with no
   * network call. Default `true`; set `false` for kiosks, shared machines, or
   * strict privacy policies.
   */
  cache?: boolean;

  /**
   * What the visitor sees if the engine cannot load.
   *
   * `true` (default) renders a plain, usable textarea carrying `defaultContent`
   * and the `name` below — the visitor keeps writing and the form still
   * submits. `false` leaves the container untouched. A string replaces the
   * default message.
   */
  fallback?: boolean | string;

  /**
   * Form field name for the degraded textarea, so an ordinary form submit
   * still works when the editor could not load. Never forwarded to the engine.
   */
  name?: string;

  /**
   * Called with any load failure. Without it, the error is logged to the
   * console — either way it is never swallowed silently.
   */
  onError?: (error: Error) => void;
}

/**
 * Everything `createEditor` accepts: the loader's own options plus the editor's
 * entire config, unmodified and unduplicated.
 */
export interface LoaderOptions extends OpenEditorConfig, LoaderOnlyOptions {}

// ─── Session ─────────────────────────────────────────────────────────────────

/** Where the loader fetches the engine, and what it must hash to. */
export interface EngineDescriptor {
  /** Object-storage key of the bundle. */
  key: string;
  /** SHA-256 the downloaded bytes are verified against BEFORE they execute. */
  sha256: string;
  /** Fetchable URL; already signed when the plan is premium. */
  url: string;
}

/** The answer to "who is this visitor, which build, what may they use?" */
export interface DeliverySession {
  /** Short-lived; carries plan, features and version. */
  sessionToken: string;
  /** Long-lived; rotated on use. */
  refreshToken: string;
  /** Unix seconds at which `sessionToken` expires. */
  expiresAt: number;
  plan: string;
  /** Feature ids this session may actually use (package ∩ build). */
  features: string[];
  /** The engine version that was resolved. */
  version: string;
  engine: EngineDescriptor;
}

export interface OpenSessionOptions {
  endpoint: string;
  licenceKey?: string | null;
  installId?: string | null;
  version?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Fetch, verify and mount the editor.
 *
 * Rejects on failure — and, unless `fallback` is `false`, also leaves a usable
 * textarea in the container so the visitor is never blocked.
 *
 * @param target CSS selector or element to mount into
 */
export function createEditor(
  target: string | Element,
  options: LoaderOptions,
): Promise<OpenEditor>;

/**
 * Apply a new licence key to a LIVE editor (E1) — the delivery equivalent of
 * the npm wrapper's reactive `licenseKey`.
 *
 * A same-plan change is applied in place. A PLAN change needs a different
 * bundle, which is never swapped under a live document (§1.7): the result
 * reports `reloadRequired` and the host chooses the moment.
 */
export function applyLicence(
  editor: OpenEditor,
  licenceKey: string | null,
  options: { endpoint: string; version?: string | null; installId?: string | null },
): Promise<{ applied: boolean; plan: string; reloadRequired: boolean }>;

/** Open a delivery session without mounting anything. */
export function openSession(options: OpenSessionOptions): Promise<DeliverySession>;

/** Download a bundle and verify it against `sha256`. Rejects on mismatch. */
export function fetchEngine(
  url: string,
  sha256: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<string>;

/** Evaluate verified ESM source and return its module namespace. */
export function evaluateModule(
  source: string,
  options?: { importImpl?: (url: string) => Promise<unknown> },
): Promise<Record<string, unknown>>;

/** The message shown when a Content-Security-Policy blocks the engine. */
export const CSP_HELP: string;

// ─── Cache ───────────────────────────────────────────────────────────────────

/** Remove every cached bundle. The answer to "try clearing your editor cache". */
export function clearCache(): Promise<boolean>;

/** Remove one cached bundle. */
export function clearBundle(version: string, plan: string, endpoint?: string): Promise<boolean>;

/** The plan and version remembered from the last visit (T10), if any. */
export function readLastPlan(
  endpoint?: string,
): Promise<{ plan: string; version: string | null } | null>;

/**
 * Cache key for a bundle. Always version AND plan — never version alone — and
 * scoped by endpoint origin so staging and production never share an entry.
 */
export function keyFor(version: string, plan: string, endpoint?: string): string;

/** How many bundles are kept before least-recently-used eviction. */
export const MAX_ENTRIES: number;

// ─── Install id (T18) ────────────────────────────────────────────────────────

/**
 * The stable anonymous id for this browser profile, minting one on first use.
 * `null` where storage is unavailable — never a reason to block a load.
 *
 * Not a user identifier: random, and never derived from anything about the
 * device or person.
 */
export function getInstallId(): string | null;

/** Mint a fresh install id without persisting it. */
export function mintInstallId(): string;

/** Is this a well-formed install id? */
export function isValidInstallId(value: unknown): value is string;

// ─── Fallback ────────────────────────────────────────────────────────────────

export interface FallbackOptions {
  message?: string;
  initialValue?: string;
  name?: string;
  ariaLabel?: string;
}

/** Render the degraded textarea into a container. */
export function renderFallback(
  el: Element,
  error: Error,
  options?: FallbackOptions,
): HTMLTextAreaElement | null;

/** Remove a previously rendered fallback. */
export function removeFallback(el: Element): void;

/** Is this container currently showing a fallback? */
export function hasFallback(el: Element): boolean;
