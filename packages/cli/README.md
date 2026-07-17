# `openeditors` — the Open Editor family CLI

One command to add an **Open Editor** to any project — React, Vue, Angular,
or plain JavaScript.

```bash
npx openeditors add text
```

That single line:

1. Detects your framework (React / Vue / Angular / plain JS) from `package.json`
2. Detects your package manager (npm / pnpm / yarn / bun) from the lockfile
3. Installs [`openeditor-text`](https://www.npmjs.com/package/openeditor-text)
   plus the matching wrapper (`openeditor-text-react` / `-vue` / `-angular`)
4. Prints ready-to-paste starter code for exactly your setup

## The global command

```bash
npm i -g openeditors
openeditor add text
```

## Options

| Flag | Effect |
|---|---|
| `--dry-run` | Detect + print starter code without installing |
| `-v`, `--version` | Print the CLI version |
| `-h`, `--help` | Help |

## The family

| Package | What it is |
|---|---|
| `openeditor-text` | Rich text editor engine — zero dependencies, ~61 KB gz |
| `openeditor-text-react` / `-vue` / `-angular` | Official framework wrappers |
| `openeditor-image` | Reserved — the image editor, when it ships |

## License

MIT · [Repository](https://github.com/ami130/open-editor)
