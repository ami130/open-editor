/**
 * ai-complete.js — the FREE, BYO-endpoint AI plumbing (19.7 tier-split: the
 * raw hook ships free; the premium package sells the polished product on top).
 *
 * Zero dependencies, zero vendor lock: you point `aiEndpoint` at ANY server
 * (your own proxy, a serverless function, an LLM gateway) and this POSTs a JSON
 * body, reads a streaming response, and inserts tokens at the caret as they
 * arrive. No API key ever touches this code — keys live on your endpoint (or in
 * `aiHeaders` if you knowingly expose them client-side).
 *
 * Response contract (kept deliberately simple + provider-agnostic):
 *   • Preferred: a text/event-stream of `data: {"delta":"..."}` lines (the
 *     shape OpenAI-compatible gateways emit), or `data: <raw text>`; `[DONE]`
 *     ends it. We extract `delta`/`text`/`content` from JSON, else use the raw.
 *   • Fallback: a plain streamed text body (no SSE framing) — inserted as-is.
 *   • Non-streaming JSON `{ text }` / `{ content }` also works (read whole).
 *
 * Nothing here runs unless the integrator sets `aiEndpoint` AND calls
 * editor.aiComplete(...) — default config is null, so the free bundle's
 * behavior is unchanged for everyone who doesn't opt in.
 */

/** Pull an incremental token out of one SSE `data:` payload. */
function tokenFromData(payload) {
  const s = payload.trim();
  if (!s || s === '[DONE]') return null;
  if (s[0] === '{') {
    try {
      const obj = JSON.parse(s);
      // Common shapes: {delta}, {text}, {content}, OpenAI {choices:[{delta:{content}}]}
      if (typeof obj.delta === 'string') return obj.delta;
      if (typeof obj.text === 'string') return obj.text;
      if (typeof obj.content === 'string') return obj.content;
      const choice = obj.choices && obj.choices[0];
      if (choice) {
        if (choice.delta && typeof choice.delta.content === 'string') return choice.delta.content;
        if (typeof choice.text === 'string') return choice.text;
      }
      return '';
    } catch {
      return s; // not JSON after all — treat as raw text
    }
  }
  return s;
}

export const aiMixin = {
  /**
   * Stream a completion from the configured endpoint, inserting tokens at the
   * caret as they arrive. Returns the full text; resolves '' and no-ops if no
   * endpoint is configured. Never throws for network/stream errors — it emits
   * an 'aiError' event and resolves what it had.
   *
   * @param {object} opts
   * @param {string} opts.prompt           the user/task prompt (required)
   * @param {string} [opts.system]         optional system instruction
   * @param {object} [opts.body]           extra fields merged into the POST body
   * @param {boolean} [opts.insert=true]   insert tokens at the caret as they stream
   * @param {(tok:string, full:string)=>void} [opts.onToken]  per-token callback
   * @param {AbortSignal} [opts.signal]    cancel the request/stream
   * @returns {Promise<string>} the accumulated text
   */
  async aiComplete(opts = {}) {
    if (this._destroyed) return '';
    const endpoint = this._config && this._config.aiEndpoint;
    if (!endpoint) {
      this.emit('aiError', { reason: 'no-endpoint' });
      return '';
    }
    if (!opts.prompt) return '';
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      (this._config && this._config.aiHeaders) || {}
    );
    const body = JSON.stringify(Object.assign(
      { prompt: opts.prompt, system: opts.system, stream: true },
      opts.body || {}
    ));
    const insert = opts.insert !== false;

    let res;
    try {
      res = await fetch(endpoint, { method: 'POST', headers, body, signal: opts.signal });
    } catch (err) {
      this.emit('aiError', { reason: 'network', error: err });
      return '';
    }
    if (!res || !res.ok) {
      this.emit('aiError', { reason: 'http', status: res && res.status });
      return '';
    }

    this.emit('aiStart', {});
    let full = '';
    const push = (tok) => {
      if (!tok) return;
      full += tok;
      if (insert && this.selection) this.selection.insertAtCursor(tok);
      if (typeof opts.onToken === 'function') opts.onToken(tok, full);
    };

    // Stream when the body is a readable stream; else read the whole response.
    try {
      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          // Split complete SSE records / lines; keep the trailing partial.
          const parts = buf.split(/\r?\n/);
          buf = parts.pop();
          for (const line of parts) {
            const l = line.trim();
            if (!l) continue;
            const payload = l.startsWith('data:') ? l.slice(5) : l;
            const tok = tokenFromData(payload);
            if (tok === null) { this.emit('aiDone', { text: full }); return full; }
            push(tok);
          }
        }
        if (buf.trim()) {
          const l = buf.trim();
          push(tokenFromData(l.startsWith('data:') ? l.slice(5) : l) || '');
        }
      } else {
        // No stream support — read the whole body (JSON { text|content } or text).
        const text = await res.text();
        push(tokenFromData(text) || text);
      }
    } catch (err) {
      this.emit('aiError', { reason: 'stream', error: err });
      this.emit('aiDone', { text: full });
      return full;
    }
    this.emit('aiDone', { text: full });
    return full;
  },
};
