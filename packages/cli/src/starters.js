/**
 * Ready-to-paste starter code per framework — kept in lockstep with the
 * wrapper READMEs (packages/react|vue|angular/README.md), which are the
 * live-proven quickstarts.
 */

const STARTERS = {
  vanilla: `import { OpenEditor } from 'openeditor-text';

const editor = new OpenEditor('#editor', {
  placeholder: 'Start typing…',
});

editor.on('onChange', ({ html }) => {
  // html is sanitized — persist it wherever you like
});`,

  react: `import { OpenEditor } from 'openeditor-text-react';
import 'openeditor-text/styles';

export default function MyEditor() {
  return (
    <OpenEditor
      value="<p>Hello <strong>world</strong></p>"
      onChange={(html) => console.log(html)}
    />
  );
}

// Next.js? Render client-side:
//   const OpenEditor = dynamic(
//     () => import('openeditor-text-react').then((m) => m.OpenEditor),
//     { ssr: false },
//   );`,

  vue: `<script setup>
import { ref } from 'vue';
import { OpenEditor } from 'openeditor-text-vue';
import 'openeditor-text/styles';

const html = ref('<p>Hello <strong>world</strong></p>');
</script>

<template>
  <OpenEditor v-model="html" />
</template>`,

  angular: `import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OpenEditorComponent } from 'openeditor-text-angular';

@Component({
  standalone: true,
  imports: [FormsModule, OpenEditorComponent],
  template: '<open-editor [(ngModel)]="html"></open-editor>',
})
export class MyEditorComponent {
  html = '<p>Hello <strong>world</strong></p>';
}

// One-time: add the editor styles in angular.json → "styles":
//   "node_modules/openeditor-text/dist/open-editor.css"`,
};

export function starterFor(framework) {
  return STARTERS[framework] || STARTERS.vanilla;
}

export function docsLineFor(framework) {
  const pkg = {
    react: 'openeditor-text-react',
    vue: 'openeditor-text-vue',
    angular: 'openeditor-text-angular',
  }[framework];
  return pkg
    ? `Full guide: https://www.npmjs.com/package/${pkg}`
    : 'Full guide: https://www.npmjs.com/package/openeditor-text';
}
