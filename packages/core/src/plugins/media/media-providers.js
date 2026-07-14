/**
 * media-providers.js — Phase 13.5: parse a media URL into a safe embed spec.
 *
 * Pure functions, no DOM. Only a strict allowlist of providers is recognized;
 * anything else returns null (the plugin then refuses to embed). The returned
 * `src` is always an HTTPS URL on a known embed host — never user-controlled
 * arbitrary origin — which is the first line of the Media Embed security model.
 * The sanitizer enforces the SAME host allowlist as a second, independent line
 * of defense (defense in depth).
 */

// Allowed embed hosts (exact host match, https only). The sanitizer imports
// this same list so the two layers can never drift.
export const ALLOWED_EMBED_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
]);

// The sandbox token set we force on every embed iframe: enough for playback,
// nothing that lets the frame navigate the top window, open popups, or submit
// forms. Kept deliberately minimal.
export const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-presentation';

const YT_ID = /^[\w-]{6,20}$/;      // YouTube video id charset

/** Extract a YouTube video id from the common URL shapes, else null. */
function youtubeId(u) {
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    return YT_ID.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') {
      const id = u.searchParams.get('v');
      return id && YT_ID.test(id) ? id : null;
    }
    const m = u.pathname.match(/^\/(?:embed|shorts|v)\/([\w-]{6,20})/);
    return m ? m[1] : null;
  }
  return null;
}

/** Extract a Vimeo numeric id, else null. */
function vimeoId(u) {
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/);
    return m ? m[1] : null;
  }
  if (host === 'player.vimeo.com') {
    const m = u.pathname.match(/^\/video\/(\d+)/);
    return m ? m[1] : null;
  }
  return null;
}

/**
 * Parse a raw URL into a safe embed spec, or null if unrecognized/unsafe.
 * @returns {{ provider: string, src: string } | null}
 */
export function parseMediaUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  let u;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  // HTTPS only — never embed an http:// or javascript:/data: origin.
  if (u.protocol !== 'https:') return null;

  const yt = youtubeId(u);
  if (yt) {
    return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}` };
  }
  const vim = vimeoId(u);
  if (vim) {
    return { provider: 'vimeo', src: `https://player.vimeo.com/video/${vim}` };
  }
  return null;
}

/** Is a src URL on the embed-host allowlist (used by the sanitizer)? */
export function isAllowedEmbedSrc(src) {
  if (typeof src !== 'string') return false;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && ALLOWED_EMBED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}
