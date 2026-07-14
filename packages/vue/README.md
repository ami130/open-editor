# @open-editor-hq/vue

Official Vue 3 wrapper for [Open Editor](https://www.npmjs.com/package/@open-editor-hq/core) — `v-model` component + `useOpenEditor` composable, zero dependencies beyond Vue itself.

```vue
<script setup>
import { ref } from 'vue';
import { OpenEditor } from '@open-editor-hq/vue';
const html = ref('<p>Hello</p>');
</script>

<template>
  <OpenEditor v-model="html" theme="auto" />
</template>
```

- `v-model` with echo-diffing — typing never disturbs the caret
- Emits: `change`, `ready`, `focus`, `blur`, `error`
- Reactive props: `modelValue`, `readOnly`, `theme`, `direction`; config/plugins are construct-time (remount via `:key`)
- Template ref exposes `editor`, `getHTML()`, `getMarkdown()`, `focus()`
- Composition idiom: `const { editor } = useOpenEditor(hostRef, { config })`

MIT. TypeScript types included.
