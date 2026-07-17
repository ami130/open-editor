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
