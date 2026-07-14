export { normalizeEncoding, normalizeTextNodes, normalizeStructure } from './sanitizer-utils.js';
import { normalizeEncoding, normalizeTextNodes, normalizeStructure } from './sanitizer-utils.js';
import { isUnsafeUrl, isUnsafeStyle } from './sanitizer-utils.js';
import { DEFAULT_TAG_WHITELIST, DENY_TAGS_FULL, isSafeEmbedIframe, EMBED_IFRAME_ATTRS } from './sanitizer-config.js';

// ─── Walk DOM tree and clean ──────────────────────────────────────────────────

function walkAndStrip(node, tagAllowMap, attrAllowMap, denySet, sanitizerOpts) {
  const children = Array.from(node.childNodes);

  for (const child of children) {
    if (child.nodeType === 8) {
      // Remove HTML comments — can hide script content
      node.removeChild(child);
      continue;
    }

    if (child.nodeType !== 1) continue; // keep text nodes

    const tag = child.tagName.toLowerCase();

    // Deny-list: remove entire subtree — with ONE scoped exception for a safe
    // provider-embed iframe (13.5). A validated embed iframe is kept (attributes
    // trimmed to the embed set); every other iframe is still removed.
    if (denySet.has(tag)) {
      if (tag === 'iframe' && isSafeEmbedIframe(child)) {
        for (const attr of Array.from(child.attributes)) {
          const an = attr.name.toLowerCase();
          if (an.startsWith('on') || !EMBED_IFRAME_ATTRS.has(an)) {
            child.removeAttributeNode(attr);
          } else if (an === 'style' && isUnsafeStyle(attr.value)) {
            child.removeAttributeNode(attr);
          }
        }
        // Defensively empty the iframe. An embed has no meaningful children, and
        // <iframe> is RAWTEXT — so any content is inert in a spec parser, but it
        // survives in the serialized string. Stripping it removes even the
        // theoretical risk of a downstream consumer string-hoisting that content
        // out of the iframe. (Audit hardening — belt-and-suspenders.)
        while (child.firstChild) child.removeChild(child.firstChild);
        continue; // keep the (now empty) sanitized embed iframe
      }
      node.removeChild(child);
      continue;
    }

    // Not in whitelist: unwrap (keep children, remove the element itself).
    // Recurse into the unwrapped element FIRST so its descendants are cleaned,
    // then splice its children into the parent in place. Avoids the previous
    // O(n^2) full re-walk of the parent on every unknown element.
    if (!tagAllowMap.has(tag)) {
      walkAndStrip(child, tagAllowMap, attrAllowMap, denySet, sanitizerOpts);
      while (child.firstChild) {
        node.insertBefore(child.firstChild, child);
      }
      node.removeChild(child);
      continue;
    }

    // Allowed tag — sanitize attributes
    const allowedAttrs = new Set([
      ...(tagAllowMap.get(tag) || []),
      ...(attrAllowMap.get(tag) || []),
    ]);

    const attrsToRemove = [];
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();

      // Strip all event handlers (on*)
      if (name.startsWith('on')) {
        attrsToRemove.push(attr.name);
        continue;
      }

      // Strip attributes not in whitelist
      if (!allowedAttrs.has(name)) {
        attrsToRemove.push(attr.name);
        continue;
      }

      // URL attributes — block dangerous schemes
      // `cite` on <blockquote>/<q> is a URL attribute; browsers don't navigate to it
      // automatically but we still sanitize it for consistency.
      const isUrlAttr = name === 'href' || name === 'src' || name === 'action' ||
                        name === 'xlink:href' || name === 'srcdoc' || name === 'cite';
      if (isUrlAttr) {
        if (name === 'srcdoc' || isUnsafeUrl(attr.value, sanitizerOpts)) {
          attrsToRemove.push(attr.name);
          continue;
        }
      }

      // M1 fix: srcset carries a comma-separated list of "URL [descriptor]"
      // candidates. It was allowed on <img> but never scheme-checked, so a
      // data:/javascript: candidate slipped through and defeated the data-URI
      // policy. Validate every candidate URL; strip the whole attribute if any
      // is unsafe.
      if (name === 'srcset') {
        const unsafe = attr.value.split(',').some((cand) => {
          const url = cand.trim().split(/\s+/)[0];
          return url && isUnsafeUrl(url, sanitizerOpts);
        });
        if (unsafe) { attrsToRemove.push(attr.name); continue; }
      }

      // style attribute — block CSS injection
      if (name === 'style') {
        if (isUnsafeStyle(attr.value)) {
          attrsToRemove.push(attr.name);
          continue;
        }
      }

      // target="_blank" without rel="noopener" is a tabnabbing risk — enforce.
      // H1 fix: `target` is case-insensitive and may carry surrounding
      // whitespace in the browser, so compare a trimmed+lowercased value
      // (catches _BLANK, "_blank "). And check `rel` by exact TOKEN, not
      // substring — `rel="noopeners-fake"` contains "noopener" as a substring
      // but is not a real noopener token, which the old .includes() missed.
      if (name === 'target' && attr.value.trim().toLowerCase() === '_blank') {
        const relTokens = (child.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
        if (!relTokens.includes('noopener')) {
          relTokens.push('noopener');
          if (!relTokens.includes('noreferrer')) relTokens.push('noreferrer');
          child.setAttribute('rel', relTokens.join(' '));
        }
      }
    }

    for (const attrName of attrsToRemove) {
      child.removeAttributeNode(child.getAttributeNode(attrName));
    }

    // Recurse into children
    walkAndStrip(child, tagAllowMap, attrAllowMap, denySet, sanitizerOpts);
  }
}

// ─── mXSS double-parse defense ───────────────────────────────────────────────
// Re-parse the serialized output and RE-STRIP it. Serialization can mutate
// markup (the classic mXSS vector) into something dangerous that the first
// pass never saw, so a re-parse that does not re-sanitize provides no real
// protection. We re-walk with the same effective allow/deny maps.

function mxssPass(html, doc, tagAllowMap, attrAllowMap, denySet, sanitizerOpts) {
  const tmp = doc.createElement('div');
  tmp.innerHTML = html;
  walkAndStrip(tmp, tagAllowMap, attrAllowMap, denySet, sanitizerOpts);
  return tmp.innerHTML;
}

// ─── Public sanitize() ───────────────────────────────────────────────────────

/**
 * Sanitize an HTML string using DOM parsing.
 *
 * @param {string} html - Raw HTML input
 * @param {object} [options]
 * @param {string[]} [options.allowTags]   - Extra tags to allow beyond defaults
 * @param {object}  [options.allowAttributes] - { tagName: [attrNames] } extra attrs per tag
 * @param {string[]} [options.denyTags]    - Additional tags to deny entirely
 * @param {Document} [options.document]   - Inject document for test environments
 * @returns {string} Sanitized HTML string
 */
export function sanitize(html, options = {}) {
  if (typeof html !== 'string') return '';
  if (!html.trim()) return '';

  // Validate option types — silently coerce wrong types to safe defaults
  if (options.allowTags != null && !Array.isArray(options.allowTags)) {
    if (typeof console !== 'undefined') console.warn('sanitize: allowTags must be an array — ignoring');
    options = Object.assign({}, options, { allowTags: null });
  }
  if (options.denyTags != null && !Array.isArray(options.denyTags)) {
    if (typeof console !== 'undefined') console.warn('sanitize: denyTags must be an array — ignoring');
    options = Object.assign({}, options, { denyTags: null });
  }
  if (options.allowAttributes != null &&
      (typeof options.allowAttributes !== 'object' || Array.isArray(options.allowAttributes))) {
    if (typeof console !== 'undefined') console.warn('sanitize: allowAttributes must be a plain object — ignoring');
    options = Object.assign({}, options, { allowAttributes: null });
  }

  // 17.5.11 — extension guardrails: the deny-list and the on*/URL-sink rules
  // are structurally non-negotiable (deny is checked before allow; on* is
  // stripped before the allowlist; URL sinks are scheme-checked BY NAME on any
  // tag). A config asking for them anyway is a misunderstanding — warn loudly
  // instead of silently ignoring, so integrators learn the boundary exists.
  if (Array.isArray(options.allowTags)) {
    for (const tag of options.allowTags) {
      if (DENY_TAGS_FULL.has(String(tag).toLowerCase()) && typeof console !== 'undefined') {
        console.warn(`sanitize: allowTags cannot re-enable denied tag "${tag}" — the deny-list always wins.`);
      }
    }
  }
  if (options.allowAttributes && typeof options.allowAttributes === 'object' && !Array.isArray(options.allowAttributes)) {
    for (const attrs of Object.values(options.allowAttributes)) {
      for (const a of (Array.isArray(attrs) ? attrs : [])) {
        const an = String(a).toLowerCase();
        if ((an.startsWith('on') || an === 'srcdoc') && typeof console !== 'undefined') {
          console.warn(`sanitize: allowAttributes cannot enable "${a}" — event handlers and srcdoc are always stripped.`);
        }
      }
    }
  }

  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return '';

  // Step 1 — encoding normalization
  const input = normalizeEncoding(html);

  // Step 2 — parse into a live DOM fragment via <template> (scripts don't execute)
  let fragment;
  const tpl = doc.createElement('template');
  if (tpl.content !== undefined) {
    tpl.innerHTML = input;
    fragment = tpl.content;
  } else {
    // jsdom fallback: template.content may be undefined in older versions
    const div = doc.createElement('div');
    div.innerHTML = input;
    fragment = div;
  }

  // Step 3 — structural normalization (fix malformed nesting)
  normalizeStructure(fragment);

  // Step 3b — text content normalization: smart quotes, dashes, nbsp
  // Done AFTER DOM parsing so attribute values are never touched
  normalizeTextNodes(fragment);

  // Step 4 — build effective maps
  const tagAllowMap = new Map(DEFAULT_TAG_WHITELIST);

  // Merge extra allowed tags
  if (Array.isArray(options.allowTags)) {
    for (const tag of options.allowTags) {
      if (!tagAllowMap.has(tag.toLowerCase())) {
        tagAllowMap.set(tag.toLowerCase(), []);
      }
    }
  }

  // Merge extra allowed attributes per tag
  const attrAllowMap = new Map();
  if (options.allowAttributes && typeof options.allowAttributes === 'object') {
    for (const [tag, attrs] of Object.entries(options.allowAttributes)) {
      attrAllowMap.set(tag.toLowerCase(), Array.isArray(attrs) ? attrs : []);
    }
  }

  // Merge extra denied tags
  const denySet = new Set(DENY_TAGS_FULL);
  if (Array.isArray(options.denyTags)) {
    for (const tag of options.denyTags) {
      denySet.add(tag.toLowerCase());
      tagAllowMap.delete(tag.toLowerCase());
    }
  }

  // Step 5 — walk and strip
  const sanitizerOpts = { allowDataUris: !!options.allowDataUris, allowBlobUris: !!options.allowBlobUris };
  walkAndStrip(fragment, tagAllowMap, attrAllowMap, denySet, sanitizerOpts);

  // Step 6 — serialize back to string
  let result;
  if (tpl.content !== undefined) {
    const wrapper = doc.createElement('div');
    // Move all nodes from DocumentFragment into a div for serialization
    while (fragment.firstChild) {
      wrapper.appendChild(fragment.firstChild);
    }
    result = wrapper.innerHTML;
  } else {
    result = fragment.innerHTML;
  }

  // Step 7 — mXSS double-parse defense (re-parse AND re-strip)
  result = mxssPass(result, doc, tagAllowMap, attrAllowMap, denySet, sanitizerOpts);

  return result;
}
