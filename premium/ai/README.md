# @openeditor-premium/ai (19.7)

The **AI Writing product**, built on the FREE BYO-endpoint `editor.aiComplete()`
hook (core 19.7). Four independently-gated plugins:

- **Quick Actions** — gated `ai.quickActions`. A toolbar button opens a menu:
  Improve / Summarize / Make shorter / Make longer / change tone
  (professional / casual / confident). Runs on the current selection and
  streams the transformed text in its place.
- **Chat panel** — gated `ai.panel`. A toolbar button opens a multi-turn side
  panel; replies stream into a transcript and insert at the caret on demand.
- **Translate** — gated `ai.translate`. A language menu; picking one translates
  the selection in place (12 built-in languages, configurable).
- **Review** — gated `ai.review`. Reviews the **current selection** for
  grammar/clarity, requests STRUCTURED suggestions (JSON), and shows an
  accept/reject panel; accepted fixes are applied to the reviewed selection.
  Requires a selection (it never rewrites the whole document — doing so would
  flatten formatting/images/tables). Runs `aiComplete` with `insert:false` and
  parses the response (`review-core.js` tolerates fenced/preambled JSON, drops
  malformed/no-op/duplicate entries). Text-level apply within the selection —
  content OUTSIDE the selection is never touched.

## Selection handling (2026-07-17 fix)

All selection-based actions (Quick Actions, Translate, Review) **snapshot the
editor selection when their menu/panel opens** and restore it before acting —
because clicking a menu item or focusing the modal collapses the live selection.
Chat's "Insert into document" likewise restores the caret captured when the
panel opened. Without this, the actions silently no-op'd (the selection was gone
by the time they ran).

## Usage

```js
import { createPremiumHost } from '@openeditor-premium/runtime';
import { createAiQuickActionsPlugin, createAiChatPlugin } from '@openeditor-premium/ai';

// 1) Configure the FREE hook (this is the transport; no vendor lock, BYO key):
const editor = new OpenEditor(el, {
  aiEndpoint: 'https://your-proxy.example/complete',
  aiHeaders: { Authorization: 'Bearer …' }, // optional; prefer a server proxy
});

// 2) Install the premium product on top:
const host = await createPremiumHost({ license, keys });
editor.plugins.install(createAiQuickActionsPlugin(host));
editor.plugins.install(createAiChatPlugin(host));
editor.plugins.install(createAiTranslatePlugin(host)); // gated ai.translate
editor.plugins.install(createAiReviewPlugin(host));     // gated ai.review
```

Granted → toolbar buttons + `editor.aiQuickAction(id)` / `editor.openAiChat()`.
Denied → graceful degrade (no button/handle, dismissible notice).

## The free/premium split (why the transport is free)

Per the plan, the raw plumbing ships FREE (`editor.aiComplete()` — a
BYO-endpoint streaming-insert hook) as the funnel; this package sells the
polished product (Quick Actions menu, Chat panel). The premium layer never
touches the network directly — it composes `aiComplete()`, so there is exactly
one transport, one place to point at your endpoint, and no key handling here.

## Response contract (from the free hook)

Your endpoint receives `POST { prompt, system, stream, ... }` and may reply
with an SSE `data:` stream (`{"delta":"…"}` / OpenAI `choices[].delta.content`
/ raw text; `[DONE]` ends it) or a whole JSON `{ text }` / plain body. See
`packages/core/src/ai/ai-complete.js`.

## Which AI provider? (there is none built in — you bring it)

This package ships **no AI provider, no model, and no API key**. That's the
point of BYO: you keep full control and no key ever lives in client code. To
make the AI features actually produce text you point `aiEndpoint` at **your own
server/proxy**, which holds the key and calls whatever model you like.

Any OpenAI-compatible API works, including free tiers such as **Groq**
(fast, free tier, OpenAI-compatible). Recommended shape:

```
Browser (editor.aiComplete)  →  YOUR /api/ai proxy  →  Groq / OpenAI / Anthropic …
        (no key)                (holds the API key)      (the model)
```

Minimal proxy (Node/Express, streaming Groq example — keeps the key server-side):

```js
app.post('/api/ai', async (req, res) => {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      stream: true,
      messages: [
        { role: 'system', content: req.body.system || '' },
        { role: 'user', content: req.body.prompt },
      ],
    }),
  });
  res.setHeader('Content-Type', 'text/event-stream');
  r.body.pipe(res); // Groq streams OpenAI-shaped `data: {choices:[{delta:{content}}]}` — aiComplete reads it directly
});
```

Then: `new OpenEditor(el, { aiEndpoint: '/api/ai' })`. **Never** put the key in
`aiHeaders` in the browser — it would be public. `aiHeaders` is only for headers
that are safe to expose (e.g. a short-lived signed token your backend issues).

> The demo playground wires a **fake local endpoint** (`apps/playground/main.js`)
> so the AI buttons visibly work with zero setup — it echoes a canned reply, it
> is NOT a real model. Swap in your proxy for real output.

## Error + loading feedback

The AI features now surface state in a slim bar under the editor (via
`ai-status.js`): a **"Translating…/Working…" spinner** while a request is in
flight, and a **clear, actionable error** if it fails — e.g. *"AI is not
configured. Set an aiEndpoint…"* for a missing endpoint, or a network/HTTP
message otherwise. Previously a missing or failing endpoint failed **silently**
(the button looked dead); now the user always gets feedback. Failures also
**never delete the selected text** — the translation/action only replaces the
selection once real text comes back.

## Architecture (pure where possible)

- **`prompts.js`** — pure prompt builders (rewrite/summarize/tone/length) +
  the `QUICK_ACTIONS` set. Unit-tested wording.
- **`quick-actions-plugin.js`** — selection → delete → stream replacement via
  `aiComplete`; menu via `editor.ui.contextMenu`.
- **`chat-panel.js` / `chat-plugin.js`** — theme-aware panel; completions run
  with `insert:false` and insert on the user's click.

14 prompt/review-core + 15 plugin unit tests (against a real editor + mocked
streaming/structured fetch) + 7 e2e (×3 engines), including the full review
accept→apply flow and the free hook working with no license.
