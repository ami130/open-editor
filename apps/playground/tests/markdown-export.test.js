/**
 * markdown-export.test.js — 17.5.12 live: rich content typed/built in the
 * real editor serializes to correct GFM.
 */
import { test, expect } from '@playwright/test';

test('a rich document exports to GitHub-flavored Markdown', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<h1>Doc</h1>'
    + '<p>Plain <strong>bold</strong> and <a href="https://x.com">link</a>.</p>'
    + '<ul data-todo-list><li data-todo data-checked="true" role="checkbox" aria-checked="true">shipped</li></ul>'
    + '<pre><code class="language-js">let a = 1;</code></pre>'
    + '<table><tbody><tr><th>K</th><th>V</th></tr><tr><td>x</td><td>1</td></tr></tbody></table>'
  ));
  const md = await page.evaluate(() => window.__openEditorInstance.getMarkdown());
  expect(md).toContain('# Doc');
  expect(md).toContain('Plain **bold** and [link](https://x.com).');
  expect(md).toContain('- [x] shipped');
  expect(md).toContain('```js\nlet a = 1;\n```');
  expect(md).toContain('| K | V |');
});

test('to-do state survives a full save-reload cycle (the 1.0.0 data-loss fix)', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  const survived = await page.evaluate(() => {
    const ed = window.__openEditorInstance;
    ed.setHTML('<ul data-todo-list><li data-todo data-checked="true" role="checkbox" aria-checked="true">keep me</li></ul>');
    ed.setHTML(ed.getHTML()); // save → reload
    return ed.getHTML();
  });
  expect(survived).toContain('data-checked="true"');
  expect(survived).toContain('data-todo-list');
});
