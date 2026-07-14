# Error reporting & telemetry

Open Editor never swallows an internal failure silently where it matters: it
emits an **`error` event** so your app can log it, report it to a service
(Sentry, Datadog, Bugsnag…), or surface a message to the user. The core stays
alive — the event is a notification, not a crash.

## The `error` event

```js
editor.on('error', ({ error, context }) => {
  // error   → the caught Error object
  // context → a stable string identifying where it happened
  console.error(`[open-editor] ${context}:`, error);
});
```

Every `error` payload is `{ error: Error, context: string }`. The `context`
string is a stable, greppable identifier such as:

| Context | Meaning |
|---|---|
| `command:<name>` | A command threw during execution (e.g. `command:bold`). |
| `plugin:install:<name>` / `plugin:destroy:<name>` | A plugin failed to install/tear down. |
| `plugin:image:*` | Image insert / paste / drop / dialog failure (`:load`, `:paste`, `:drop`, `:dialog`, `:properties`). |
| `plugin:link:dialog` | Link dialog failure. |
| `plugin:media:parse` | Unsupported or invalid media/video URL. |

> **Scope note (honest contract):** `error` is emitted from **command execution
> and plugin** catch sites (14 sites, all with the `{error, context}` shape).
> A few low-level lifecycle catches (autosave read/write, print popup, a defensive
> DOM guard) log via the editor's logger rather than emitting `error`, because
> they are already-handled, non-fatal fallbacks (e.g. `localStorage` unavailable).
> Use the [`logger`](./CONFIG.md) config option to observe those.

The `error` event is part of the **frozen 1.0 API** — its name and
`{error, context}` payload will not change without a major version bump.

## Wiring a reporter (Sentry-style)

The integration is one listener. Report the error, tag it with the context, and
optionally attach editor state for reproduction:

```js
import * as Sentry from '@sentry/browser';

const editor = new OpenEditor('#app');

editor.on('error', ({ error, context }) => {
  Sentry.withScope((scope) => {
    scope.setTag('component', 'open-editor');
    scope.setTag('oe.context', context);        // e.g. "command:bold"
    scope.setExtra('oe.charCount', editor.getCharCount());
    Sentry.captureException(error);
  });
});
```

Datadog / Bugsnag / a homegrown endpoint follow the same shape — swap the
`captureException` call:

```js
editor.on('error', ({ error, context }) => {
  fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: error && error.message,
      stack: error && error.stack,
      context,
      ts: Date.now(),
      url: location.href,
    }),
    keepalive: true,   // survive a page unload
  }).catch(() => { /* never let reporting throw into the app */ });
});
```

## Guidelines

- **Attach the listener before the user interacts** — ideally right after
  construction — so early failures are captured.
- **Never throw from the handler.** A throwing reporter would surface an
  uncaught error on top of the one you're reporting. Wrap network calls in
  `.catch()`.
- **Use `context` for grouping**, not the message — it is stable across
  releases; messages may be localized or reworded.
- **`error` is not for validation feedback.** Expected user-facing conditions
  (max length hit, unsupported paste) have their own events
  (`maxLengthExceeded`, `clipboardError`); `error` is for unexpected internal
  failures.
