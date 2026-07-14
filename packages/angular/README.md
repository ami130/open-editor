# @open-editor-hq/angular

Official Angular wrapper for [Open Editor](https://www.npmjs.com/package/@open-editor-hq/core) — a standalone component with `ControlValueAccessor`, so it works with `[(ngModel)]` and reactive forms alike.

```ts
import { OpenEditorComponent } from '@open-editor-hq/angular';

@Component({
  standalone: true,
  imports: [FormsModule, OpenEditorComponent],
  template: `<open-editor [(ngModel)]="html" theme="auto"></open-editor>`,
})
export class AppComponent { html = '<p>Hello</p>'; }
```

- Forms-native: `ngModel` / `formControl`, `setDisabledState` maps to the editor's read-only mode
- Echo-diffing `writeValue` — typing never disturbs the caret
- Outputs: `(ready)`, `(changed)`, `(focused)`, `(blurred)`, `(errored)`
- Reactive inputs: `theme`, `direction`; `config`/`plugins` are construct-time
- `@ViewChild` gives you `.editor` — the full core instance
- Ships partial-Ivy FESM (Angular ≥17); sole dependency is `tslib` (Angular's own mandated helper, present in every Angular app)

MIT.
