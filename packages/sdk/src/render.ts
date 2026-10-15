/**
 * Button rendering. A plain light-DOM <button> so partners can restyle it with
 * their own CSS. The default stylesheet is wrapped in :where() (zero
 * specificity), so any partner rule wins without !important.
 */
import { createIcon } from './icons';
import type { ButtonOptions } from './keys';

export const STYLE_ID = 'recordseek-sdk-style';

export const DEFAULT_CSS = `
:where(.recordseek-button){--recordseek-bg:#1f6f43;--recordseek-fg:#fff;display:inline-flex;align-items:center;justify-content:center;gap:.5em;box-sizing:border-box;margin:0;padding:.6em 1.1em;border:1px solid transparent;border-radius:8px;background:var(--recordseek-bg);color:var(--recordseek-fg);font:600 15px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-decoration:none;cursor:pointer;-webkit-appearance:none;appearance:none}
:where(.recordseek-button:hover){filter:brightness(1.12)}
:where(.recordseek-button:active){filter:brightness(.95)}
:where(.recordseek-button:focus-visible){outline:3px solid #7fc8a0;outline-offset:2px}
:where(.recordseek-button--sm){font-size:13px;padding:.45em .9em}
:where(.recordseek-button--lg){font-size:17px;padding:.75em 1.3em}
:where(.recordseek-button--pill){border-radius:999px}
:where(.recordseek-button--square){border-radius:0}
:where(.recordseek-button__icon){flex:none;width:1.25em;height:1.25em}
:where(.recordseek-button__label){min-width:0}
`;

/** A CSS color the browser accepts, else undefined. */
export function safeColor(value: string | undefined): string | undefined {
  if (!value || value.length > 100 || /[;{}<>]/.test(value)) return undefined;
  try {
    return typeof CSS !== 'undefined' && CSS.supports && CSS.supports('color', value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Inject the default stylesheet once per page. */
export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = DEFAULT_CSS;
  (document.head || document.documentElement).appendChild(style);
}

/** Build the button; `stylesEnabled` is false when the page opted out of default styles. */
export function createButton(ui: ButtonOptions, onClick: () => void, onPointerDown: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute(
    'class',
    ui.className ?? `recordseek-button recordseek-button--${ui.size} recordseek-button--${ui.shape}`,
  );
  const bg = safeColor(ui.bgColor);
  const fg = safeColor(ui.fontColor);
  if (bg) button.style.setProperty('--recordseek-bg', bg);
  if (fg) button.style.setProperty('--recordseek-fg', fg);
  button.setAttribute('aria-label', ui.label);

  const label = document.createElement('span');
  label.className = 'recordseek-button__label';
  label.textContent = ui.label;
  const icon = ui.iconType === 'none' ? null : createIcon(ui.iconType);
  if (icon && ui.iconPosition === 'start') button.appendChild(icon);
  button.appendChild(label);
  if (icon && ui.iconPosition === 'end') button.appendChild(icon);

  button.addEventListener('pointerdown', onPointerDown);
  button.addEventListener('click', onClick);
  return button;
}
