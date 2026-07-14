export const MODAL_CSS = `
.oe-backdrop {
  position: absolute;
  inset: 0;
  background: var(--oe-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.oe-modal {
  background: var(--oe-bg);
  border: 1px solid var(--oe-border);
  border-radius: var(--oe-radius-lg);
  box-shadow: var(--oe-shadow);
  min-width: 280px;
  max-width: 560px;
  width: 90%;
  display: flex;
  flex-direction: column;
  max-height: 90%;
  overflow: hidden;
  outline: none;
}
.oe-modal__header {
  padding: 16px 20px 12px;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--oe-border);
  flex-shrink: 0;
}
.oe-modal__body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
}
.oe-modal__footer {
  padding: 12px 20px;
  border-top: 1px solid var(--oe-border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}
.oe-modal__btn {
  padding: 8px 18px;
  border-radius: var(--oe-radius);
  border: 1px solid var(--oe-border-strong);
  background: var(--oe-bg);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.oe-modal__btn:hover { background: var(--oe-bg-hover); border-color: var(--oe-primary); }
/* 14.3/2.4.7 — modal buttons had no focus indicator; keyboard users in a dialog
   couldn't tell which of OK/Cancel/Delete was focused. */
.oe-modal__btn:focus-visible { outline: 2px solid var(--oe-focus-ring); outline-offset: 2px; }
.oe-modal__btn--primary {
  background: var(--oe-primary);
  color: var(--oe-primary-fg);
  border-color: var(--oe-primary);
}
.oe-modal__btn--primary:hover { background: var(--oe-primary-hover); }
.oe-modal__btn--danger {
  background: var(--oe-danger);
  color: var(--oe-primary-fg);
  border-color: var(--oe-danger);
}
.oe-modal__btn--danger:hover { background: var(--oe-danger-hover); }
`;

export const A11Y_HELP_CSS = `
.oe-a11y-help__table { border-collapse: collapse; width: 100%; }
.oe-a11y-help__table td { padding: 5px 10px 5px 0; border-bottom: 1px solid var(--oe-chrome-divider-2); }
.oe-a11y-help__table td:last-child { text-align: end; }
.oe-a11y-help kbd {
  font: 600 11px/1.4 ui-monospace, monospace; padding: 2px 7px;
  border: 1px solid var(--oe-chrome-border-2); border-bottom-width: 2px;
  border-radius: 4px; background: var(--oe-input-bg); color: var(--oe-panel-fg);
}
`;

export const TOOLTIP_CSS = `
.oe-tooltip {
  position: absolute;
  background: var(--oe-tooltip-bg);
  color: var(--oe-primary-fg);
  font-size: 12px;
  line-height: 1.4;
  padding: 4px 8px;
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 900;
  max-width: 240px;
}
.oe-tooltip::after {
  content: '';
  position: absolute;
  border: 5px solid transparent;
}
.oe-tooltip--above::after {
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-top-color: var(--oe-tooltip-bg);
}
.oe-tooltip--below::after {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-bottom-color: var(--oe-tooltip-bg);
}
.oe-tooltip--left::after {
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-left-color: var(--oe-tooltip-bg);
}
.oe-tooltip--right::after {
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-right-color: var(--oe-tooltip-bg);
}
`;

export const MENU_CSS = `
.oe-menu {
  position: absolute;
  background: var(--oe-bg);
  border: 1px solid var(--oe-border);
  border-radius: 6px;
  box-shadow: var(--oe-shadow-md);
  padding: 4px 0;
  min-width: 160px;
  z-index: 950;
  outline: none;
}
.oe-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  position: relative;
  user-select: none;
}
.oe-menu__item:hover,
.oe-menu__item--focused {
  background: var(--oe-bg-hover);
}
.oe-menu__item--disabled {
  opacity: 0.45;
  cursor: default;
  pointer-events: none;
}
.oe-menu__item-icon { width: 16px; flex-shrink: 0; }
.oe-menu__item-label { flex: 1; }
.oe-menu__item-shortcut { color: var(--oe-fg-placeholder); font-size: 11px; margin-left: 12px; }
.oe-menu__item-arrow { color: var(--oe-fg-placeholder); margin-left: 4px; }
.oe-menu__separator {
  height: 1px;
  background: var(--oe-border);
  margin: 4px 0;
}
.oe-menu__submenu {
  position: absolute;
  left: 100%;
  top: -4px;
}
`;
