/**
 * RecordSeek mark, inlined at build time from assets/recordseek-mark.svg and
 * assets/recordseek-mark-white.svg (the single source of truth; the same files
 * are published in dist/). Parsed with DOMParser from our own static markup:
 * no innerHTML, no network requests, no partner data.
 */
import colorSvg from '../assets/recordseek-mark.svg?raw';
import whiteSvg from '../assets/recordseek-mark-white.svg?raw';

export type IconType = 'color' | 'white' | 'none';

export function createIcon(type: Exclude<IconType, 'none'>): SVGElement {
  const doc = new DOMParser().parseFromString(type === 'white' ? whiteSvg : colorSvg, 'image/svg+xml');
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGElement;
  svg.setAttribute('class', 'recordseek-button__icon');
  svg.setAttribute('width', '1.25em');
  svg.setAttribute('height', '1.25em');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}
