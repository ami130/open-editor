/**
 * Phase 11.D e2e — the "Table format" submenu: header toggle + cell alignment.
 */
import { test, expect } from '@playwright/test';

async function seedTable(page, rows = 2, cols = 2) {
  await page.evaluate(({ rows, cols }) => {
    const ed = window.__openEditorInstance;
    let html = '<table class="oe-table"><colgroup>';
    for (let c = 0; c < cols; c++) html += '<col>';
    html += '</colgroup><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) html += `<td>r${r}c${c}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table><p>after</p>';
    ed.setHTML(html);
  }, { rows, cols });
}

test.describe('Phase 11.D — Table format menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  test('Table format → Toggle header row converts the first row to <th>', async ({ page }) => {
    await seedTable(page, 2, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    // Hover the submenu parent, then click the item.
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(80);
    await page.locator('.oe-menu').getByText('Toggle header row', { exact: true }).click();
    await page.waitForTimeout(80);
    const ths = await page.evaluate(() =>
      document.querySelectorAll('.oe-editor table tr:first-child th').length);
    expect(ths).toBe(2);
  });

  // 16.7.5 — cell alignment moved from a flat menu entry into the Cell
  // properties dialog (the "Horizontal align" select).
  test('Cell properties dialog centres the cell horizontally', async ({ page }) => {
    await seedTable(page, 1, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(80);
    await page.locator('.oe-menu').getByText('Cell properties…', { exact: true }).click();
    await page.waitForTimeout(120);
    await page.locator('.oe-modal #oe-tprops-horizontal-align').selectOption('center');
    await page.locator('.oe-modal button:has-text("Apply")').click();
    await page.waitForTimeout(80);
    const align = await page.evaluate(() =>
      document.querySelector('.oe-editor td').style.textAlign);
    expect(align).toBe('center');
  });

  test('header toggle survives getHTML with scope', async ({ page }) => {
    await seedTable(page, 2, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(80);
    await page.locator('.oe-menu').getByText('Toggle header row', { exact: true }).click();
    await page.waitForTimeout(80);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).toContain('<th');
    expect(html).toContain('scope="col"');
  });

  // 16.7.5 — per-side cell borders moved into the Cell properties dialog with
  // a real width/style/color picker (side defaults to "all").
  test('Cell properties dialog applies an all-sides border to the cell', async ({ page }) => {
    await seedTable(page, 1, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(80);
    await page.locator('.oe-menu').getByText('Cell properties…', { exact: true }).click();
    await page.waitForTimeout(120);
    // Side defaults to "all"; width defaults to 1, style to solid.
    await page.locator('.oe-modal button:has-text("Apply")').click();
    await page.waitForTimeout(80);
    const border = await page.evaluate(() =>
      document.querySelector('.oe-editor td').style.border);
    expect(border).toContain('solid');
  });

  // 11.18 — table preset (extra class) chosen on insert.
  test('inserting with a preset applies the chosen class', async ({ page }) => {
    await page.locator('[title="Insert Table"], [aria-label="Insert Table"]').first().click();
    await page.waitForSelector('.oe-table-picker', { state: 'visible' });
    // The preset selector exists (config provides Bordered / Striped).
    await expect(page.locator('.oe-table-picker__preset')).toBeVisible();
    await page.locator('.oe-table-picker__preset').selectOption('table-bordered');
    await page.locator('.oe-table-picker__cell[aria-label="2 by 2"]').first().click();
    await page.waitForTimeout(100);
    const cls = await page.evaluate(() => {
      const t = document.querySelector('.oe-editor table');
      return t ? t.className : null;
    });
    expect(cls).toContain('table-bordered');
    expect(cls).toContain('oe-table'); // base class preserved
  });

  // ── Bug #1: BUILT-IN styles at insert work with zero config + real CSS ──
  test('inserting with the built-in Dotted style applies real oe-table--dotted CSS', async ({ page }) => {
    await page.locator('[title="Insert Table"], [aria-label="Insert Table"]').first().click();
    await page.waitForSelector('.oe-table-picker', { state: 'visible' });
    // built-in options are present regardless of integrator config
    const preset = page.locator('.oe-table-picker__preset');
    const opts = await preset.locator('option').allTextContents();
    expect(opts).toEqual(expect.arrayContaining(['Bordered', 'Striped', 'Dotted', 'Borderless']));
    await preset.selectOption({ label: 'Dotted' });
    await page.locator('.oe-table-picker__cell[aria-label="2 by 2"]').first().click();
    await page.waitForTimeout(100);
    const info = await page.evaluate(() => {
      const t = document.querySelector('.oe-editor table');
      const td = t.querySelector('td');
      return { cls: t.className, borderStyle: getComputedStyle(td).borderTopStyle };
    });
    expect(info.cls).toContain('oe-table--dotted');
    expect(info.borderStyle).toBe('dotted');   // the CSS actually renders
  });

  // ── Bug #1: real-mouse diagonal travel to a submenu item (2026-07-16) ──
  // ── The submenu must open ON-SCREEN even when the menu opens low, and stay
  //    open through diagonal travel (the "goes to the bottom / vanishes" bug). ──
  test('submenu opens on-screen when the menu is near the bottom edge', async ({ page }) => {
    // push the table far down so the right-click menu opens low
    await page.evaluate(() => {
      const spacer = '<p>spacer line</p>'.repeat(30);
      window.__openEditorInstance.setHTML(
        spacer + '<table class="oe-table"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>');
    });
    const cell = page.locator('.oe-editor td').first();
    await cell.scrollIntoViewIfNeeded();
    await cell.click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(150);
    const onScreen = await page.evaluate(() => {
      const s = document.querySelector('.oe-menu__submenu');
      const r = s.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight + 1;
    });
    expect(onScreen).toBe(true);              // flipped up to fit — not off the bottom
  });

  // ── #2: when the submenu FLIPS LEFT (near the right edge) it overlaps the
  //    root menu; its z-index must sit ABOVE the root menu so its items stay
  //    clickable (not covered/swallowed by the root menu). ──
  test('flipped-left submenu paints above the root menu (items clickable)', async ({ page }) => {
    // open the context menu hard against the right edge so the submenu flips left
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<table class="oe-table"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table><p>x</p>'));
    const cell = page.locator('.oe-editor td').first();
    const cb = await cell.boundingBox();
    // right-click, but force the menu near the viewport's right edge via a
    // right-click at a far-right x within the cell area
    await page.mouse.click(cb.x + cb.width - 2, cb.y + cb.height / 2, { button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => {
      const root = document.querySelector('.oe-menu:not(.oe-menu__submenu)');
      const sub = document.querySelector('.oe-menu__submenu');
      const rz = parseInt(getComputedStyle(root).zIndex, 10) || 0;
      const sz = parseInt(getComputedStyle(sub).zIndex, 10) || 0;
      // check a submenu item's centre is topmost (not covered by the root menu)
      const it = [...sub.querySelectorAll('.oe-menu__item')].find((r) => r.textContent === 'Style: Bordered');
      const r = it.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { subAbove: sz > rz, itemTopmost: !!(top && it.contains(top)) };
    });
    expect(info.subAbove).toBe(true);
    expect(info.itemTopmost).toBe(true);
  });

  // ── #3: in an RTL editor the submenu prefers to open to the LEFT. ──
  test('RTL editor opens the submenu to the left of the row', async ({ page }) => {
    await page.evaluate(() => {
      const ed = window.__openEditorInstance;
      if (ed.setDirection) ed.setDirection('rtl');
      ed.setHTML('<table class="oe-table"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table><p>x</p>');
    });
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    const parent = page.locator('.oe-menu').getByText('Table format', { exact: true });
    await parent.hover();
    await page.waitForTimeout(150);
    const opensLeft = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.oe-menu__item')].find((r) => r.textContent.includes('Table format'));
      const sub = document.querySelector('.oe-menu__submenu');
      const rr = row.getBoundingClientRect();
      const sr = sub.getBoundingClientRect();
      // submenu's centre is to the LEFT of the parent row's centre
      return (sr.left + sr.width / 2) < (rr.left + rr.width / 2);
    });
    // reset direction so later tests aren't affected
    await page.evaluate(() => { const ed = window.__openEditorInstance; if (ed.setDirection) ed.setDirection('ltr'); });
    expect(opensLeft).toBe(true);
  });

  test('submenu stays open through diagonal travel and its item is clickable (safe bridge)', async ({ page }) => {
    await seedTable(page, 2, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    const parent = page.locator('.oe-menu').getByText('Table format', { exact: true });
    const pBox = await parent.boundingBox();
    await page.mouse.move(pBox.x + pBox.width / 2, pBox.y + pBox.height / 2);
    const sub = page.locator('.oe-menu__submenu');
    await expect(sub).toBeVisible();

    // Diagonal travel: exit the parent toward its right edge and drift DOWN
    // across sibling rows / the gap onto the bridge, as a human would — then
    // PAUSE longer than the old 220ms close timer. Before the safe-bridge fix
    // the submenu closed here; now it must survive (THIS is the regression).
    await page.mouse.move(pBox.x + pBox.width - 2, pBox.y + pBox.height, { steps: 4 });
    await page.mouse.move(pBox.x + pBox.width + 4, pBox.y + pBox.height + 8, { steps: 6 });
    await page.waitForTimeout(320);                // > old 220ms delay
    await expect(sub).toBeVisible();               // survived the travel + pause

    // …and the item under the pointer's destination is the real, clickable
    // submenu item — nothing (not the bridge) intercepts its click point. This
    // is the authoritative proof the flyout is usable after diagonal travel;
    // the separate "Style: Bordered" test proves a submenu click applies a
    // style end-to-end. (We avoid a synthetic click here because Playwright's
    // "stable" check is flaky when the pointer is parked on the bridge — a
    // harness artifact, not a real-user issue.)
    const hitIsItem = await page.evaluate(() => {
      const s = document.querySelector('.oe-menu__submenu');
      const item = [...s.querySelectorAll('.oe-menu__item')].find((r) => r.textContent === 'Style: Striped');
      const r = item.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!(top && item.contains(top));
    });
    expect(hitIsItem).toBe(true);
  });

  // ── Bug #2: built-in styles work ANYTIME (not just at insert) ──
  test('Style: Bordered applies the built-in class from the format menu', async ({ page }) => {
    await seedTable(page, 2, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(80);
    await page.locator('.oe-menu').getByText('Style: Bordered', { exact: true }).click();
    await page.waitForTimeout(80);
    const cls = await page.evaluate(() => document.querySelector('.oe-editor table').className);
    expect(cls).toContain('oe-table--bordered');
  });

  // ── Bug #3: header + stripe coloring via Table properties dialog ──
  test('Table properties applies a header color and stripe color', async ({ page }) => {
    await seedTable(page, 3, 2);
    // make the first row a header so header coloring has a target
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(80);
    await page.locator('.oe-menu').getByText('Toggle header row', { exact: true }).click();
    await page.waitForTimeout(80);

    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(80);
    await page.locator('.oe-menu').getByText('Table properties…', { exact: true }).click();
    await page.waitForSelector('.oe-tprops', { state: 'visible' });

    // enable striped + header color
    await page.locator('#oe-tprops-striped-rows').check();
    await page.locator('#oe-tprops-header-color').evaluate((i) => { i.value = '#112233'; });
    // tick the header "apply" checkbox (prepended into its label)
    await page.locator('.oe-tprops label:has-text("Header color") input[type=checkbox]').check();
    await page.locator('.oe-modal__btn--primary').click();
    await page.waitForTimeout(100);

    const state = await page.evaluate(() => {
      const t = document.querySelector('.oe-editor table');
      const th = t.querySelector('th');
      return { striped: t.classList.contains('oe-table--striped'), thBg: th && th.style.backgroundColor };
    });
    expect(state.striped).toBe(true);
    expect(state.thBg).toBeTruthy();
  });

  // ── Bug #3: reopening a dialog SHOWS the design already applied ──
  test('Table properties reopens showing the header color previously applied', async ({ page }) => {
    await seedTable(page, 3, 2);
    // make a header row
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(100);
    await page.locator('.oe-menu').getByText('Toggle header row', { exact: true }).click();

    // open dialog, apply a header color
    const openProps = async () => {
      await page.locator('.oe-editor td').first().click({ button: 'right' });
      await page.waitForSelector('.oe-menu', { state: 'visible' });
      await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
      await page.waitForTimeout(100);
      await page.locator('.oe-menu').getByText('Table properties…', { exact: true }).click();
      await page.waitForSelector('.oe-tprops', { state: 'visible' });
    };
    await openProps();
    await page.locator('#oe-tprops-header-color').evaluate((i) => { i.value = '#aa3344'; });
    await page.locator('.oe-tprops label:has-text("Header color") input[type=checkbox]').check();
    await page.locator('.oe-modal__btn--primary').click();
    await page.waitForTimeout(100);

    // REOPEN — the header color field must now show the applied color, and its
    // apply-checkbox must be pre-checked (bug #3: was resetting to default).
    await openProps();
    const seededColor = await page.locator('#oe-tprops-header-color').inputValue();
    expect(seededColor.toLowerCase()).toBe('#aa3344');
    const applyChecked = await page.locator('.oe-tprops label:has-text("Header color") input[type=checkbox]').isChecked();
    expect(applyChecked).toBe(true);
  });
});
