/** Injected at build time (and by vitest) from package.json. */
declare const __SDK_VERSION__: string;

declare module '*.svg?raw' {
  const content: string;
  export default content;
}
