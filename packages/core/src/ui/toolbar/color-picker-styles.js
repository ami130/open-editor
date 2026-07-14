export const COLOR_PICKER_CSS = `
  .oe-tb__color-panel { min-width: 0; }
  .oe-tb__color-grid { display: grid; grid-template-columns: repeat(8, 20px); gap: 4px; padding: 2px; }
  .oe-tb__swatch { width: 20px; height: 20px; padding: 0; border: 1px solid rgba(0,0,0,0.15); border-radius: 3px; cursor: pointer; }
  .oe-tb__swatch:hover { transform: scale(1.15); border-color: rgba(0,0,0,0.35); }
  .oe-tb__swatch:focus-visible { outline: 2px solid var(--oe-focus-ring); outline-offset: 1px; }
  .oe-cp { width: 252px; padding: 8px; box-sizing: border-box; user-select: none; }
  .oe-cp__grad-wrap {
    position: relative; width: 100%; height: 150px; border-radius: 4px;
    overflow: hidden; cursor: crosshair; margin-bottom: 8px; flex-shrink: 0;
  }
  .oe-cp__grad { display: block; width: 100%; height: 100%; }
  .oe-cp__grad-handle {
    position: absolute; width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid var(--oe-bg); box-shadow: 0 0 0 1px rgba(0,0,0,0.4);
    transform: translate(-50%,-50%); pointer-events: none; top: 0; left: 0;
  }
  .oe-cp__sliders { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .oe-cp__preview {
    width: 32px; height: 32px; flex-shrink: 0; border-radius: 4px;
    overflow: hidden; border: 1px solid rgba(0,0,0,0.2); display: flex; flex-direction: column;
  }
  .oe-cp__preview-old, .oe-cp__preview-new { flex: 1; background: var(--oe-bg); }
  .oe-cp__slider-cols { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .oe-cp__slider-wrap { position: relative; height: 12px; border-radius: 6px; overflow: hidden; cursor: pointer; }
  .oe-cp__slider-canvas { display: block; width: 100%; height: 100%; }
  .oe-cp__slider-handle {
    position: absolute; top: 50%; width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid var(--oe-bg); box-shadow: 0 0 0 1px rgba(0,0,0,0.35);
    transform: translate(-50%,-50%); pointer-events: none; left: 0;
  }
  .oe-cp__inputs { display: flex; align-items: flex-end; gap: 4px; margin-bottom: 6px; }
  .oe-cp__field-group { display: flex; gap: 3px; flex: 1; }
  .oe-cp__field-group--hidden { display: none; }
  .oe-cp__field { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1; }
  .oe-cp__hex-input {
    width: 100%; padding: 4px 5px; border: 1px solid var(--oe-chrome-border-3); border-radius: 3px;
    font-size: 12px; font-family: monospace; box-sizing: border-box;
  }
  .oe-cp__rgb-input, .oe-cp__hsl-input {
    width: 100%; padding: 4px 2px; border: 1px solid var(--oe-chrome-border-3); border-radius: 3px;
    font-size: 12px; text-align: center; box-sizing: border-box; -moz-appearance: textfield;
  }
  .oe-cp__rgb-input::-webkit-inner-spin-button,
  .oe-cp__hsl-input::-webkit-inner-spin-button { display: none; }
  .oe-cp__hex-input:focus-visible,
  .oe-cp__rgb-input:focus-visible,
  .oe-cp__hsl-input:focus-visible { outline: 2px solid var(--oe-focus-ring); outline-offset: 0; border-color: var(--oe-focus-ring); }
  .oe-cp__field-label { font-size: 10px; color: var(--oe-panel-fg-muted); /* 17.10: faint failed AA contrast */ letter-spacing: 0.04em; line-height: 1; }
  .oe-cp__mode-btn {
    flex-shrink: 0; width: 24px; height: 28px; padding: 0; border: 1px solid var(--oe-chrome-border-3);
    border-radius: 3px; background: var(--oe-input-bg); font-size: 13px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .oe-cp__mode-btn:hover { background: var(--oe-chrome-hover); }
  .oe-cp__section { margin-bottom: 6px; }
  .oe-cp__section-label { font-size: 10px; color: var(--oe-panel-fg-muted); /* 17.10: faint failed AA contrast */ letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 4px; }
  .oe-cp__recent-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .oe-cp__footer { display: flex; justify-content: space-between; gap: 6px; margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--oe-chrome-divider-2); }
  .oe-cp__clear-btn { flex: 1; padding: 5px 8px; border: 1px solid var(--oe-chrome-border-2); border-radius: 3px; background: var(--oe-input-bg); font-size: 12px; cursor: pointer; }
  .oe-cp__clear-btn:hover { background: var(--oe-chrome-hover); }
  .oe-cp__ok-btn { flex: 1; padding: 5px 8px; border: 1px solid var(--oe-focus-ring); border-radius: 3px; background: var(--oe-primary); color: var(--oe-primary-fg); /* 17.10: focus-ring bg failed AA contrast */ font-size: 12px; font-weight: 600; cursor: pointer; }
  .oe-cp__ok-btn:hover { background: var(--oe-ok-hover); border-color: var(--oe-ok-hover); }
  .oe-tb__color-strip {
    display: block; position: absolute; bottom: 2px; left: 4px; right: 4px;
    height: 3px; border-radius: 1px; pointer-events: none;
    background: transparent; transition: background 0.15s;
  }
`;
