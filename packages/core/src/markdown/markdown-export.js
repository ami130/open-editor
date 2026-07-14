/**
 * markdown-export.js — 17.5.12: canonical DOM → GitHub-flavored Markdown.
 *
 * Zero-dep serializer for `editor.getMarkdown()`. Walks the SANITIZED HTML
 * (a detached parse of getHTML(), so the canonical-shape guarantees hold) and
 * emits GFM: headings, emphasis, inline code, links, images, nested lists,
 * to-do lists, blockquotes, fenced code blocks, hr, and pipe tables. Elements
 * with no Markdown equivalent (spans, marks, colors) contribute their text.
 * Deliberately export-only — lossless MD⇄HTML round-tripping stays premium.
 */

const escapeText = (s) => s.replace(/([\\`*_[\]])/g, '\\$1').replace(/\u00A0/g, ' ');

function inline(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) { out += escapeText(child.nodeValue); continue; }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();
    const inner = () => inline(child);
    switch (tag) {
      case 'strong': case 'b': out += `**${inner()}**`; break;
      case 'em': case 'i': out += `*${inner()}*`; break;
      case 's': case 'del': out += `~~${inner()}~~`; break;
      case 'code': out += `\`${child.textContent}\``; break;
      case 'a': {
        const href = child.getAttribute('href') || '';
        // bookmark anchors have no text — emit an HTML anchor to keep the id
        if (!child.textContent && child.id) { out += `<a id="${child.id}"></a>`; break; }
        out += `[${inner()}](${href})`;
        break;
      }
      case 'img': {
        const alt = child.getAttribute('alt') || '';
        const src = child.getAttribute('src') || '';
        out += `![${alt}](${src})`;
        break;
      }
      case 'br': out += '  \n'; break;
      default: out += inner();
    }
  }
  return out;
}

function listItems(listEl, ordered, depth) {
  const pad = '  '.repeat(depth);
  const lines = [];
  let i = 1;
  for (const li of listEl.children) {
    if (li.tagName.toLowerCase() !== 'li') continue;
    // Direct inline content of the li (sub-lists handled separately below).
    const clone = li.cloneNode(true);
    for (const sub of clone.querySelectorAll(':scope > ul, :scope > ol')) sub.remove();
    let marker = ordered ? `${i}.` : '-';
    if (li.hasAttribute('data-todo')) {
      marker = `- [${li.getAttribute('data-checked') === 'true' ? 'x' : ' '}]`;
    }
    lines.push(`${pad}${marker} ${inline(clone).trim()}`);
    for (const sub of li.children) {
      const t = sub.tagName.toLowerCase();
      if (t === 'ul' || t === 'ol') lines.push(listItems(sub, t === 'ol', depth + 1));
    }
    i++;
  }
  return lines.join('\n');
}

function tableToMd(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (!rows.length) return '';
  const cells = (tr) => Array.from(tr.children)
    .filter((c) => /^t[hd]$/i.test(c.tagName))
    .map((c) => inline(c).trim().replace(/\|/g, '\\|').replace(/\n/g, ' '));
  const header = cells(rows[0]);
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
  ];
  for (const tr of rows.slice(1)) lines.push(`| ${cells(tr).join(' | ')} |`);
  return lines.join('\n');
}

function block(el) {
  const tag = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inline(el).trim()}`;
  if (tag === 'p' || tag === 'div') {
    const text = inline(el).trim();
    return text || null; // empty paragraphs vanish in Markdown
  }
  if (tag === 'ul' || tag === 'ol') return listItems(el, tag === 'ol', 0);
  if (tag === 'blockquote') {
    return Array.from(el.children).length
      ? Array.from(el.children).map((c) => `> ${(block(c) || '').replace(/\n/g, '\n> ')}`).join('\n>\n')
      : `> ${inline(el).trim()}`;
  }
  if (tag === 'pre') {
    const code = el.querySelector('code');
    const lang = code && (code.className.match(/language-([\w-]+)/) || [])[1];
    return '```' + (lang || '') + '\n' + (code || el).textContent.replace(/\n$/, '') + '\n```';
  }
  if (tag === 'hr') return '---';
  if (tag === 'table') return tableToMd(el);
  if (tag === 'figure') {
    const img = el.querySelector('img');
    const cap = el.querySelector('figcaption');
    if (img) {
      const alt = (cap && cap.textContent.trim()) || img.getAttribute('alt') || '';
      return `![${alt}](${img.getAttribute('src') || ''})`;
    }
    return inline(el).trim() || null;
  }
  const text = inline(el).trim();
  return text || null;
}

/** Serialize sanitized editor HTML to GFM. */
export function htmlToMarkdown(html, doc) {
  const tmp = doc.createElement('div');
  tmp.innerHTML = html;
  const parts = [];
  for (const child of tmp.children) {
    const md = block(child);
    if (md != null && md !== '') parts.push(md);
  }
  return parts.join('\n\n') + (parts.length ? '\n' : '');
}

/** Instance-method mixin: editor.getMarkdown(). */
export const markdownMixin = {
  getMarkdown() {
    if (this._destroyed) return '';
    const doc = this._iframeDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return '';
    return htmlToMarkdown(this.getHTML(), doc);
  },
};
