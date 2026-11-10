// A line of help: its words, and the keys among them, which the screens draw
// as keys, in the key colour (D-388). Data rather than markup, so a test can
// read what a line says and which of it are keys.

export type HelpLine = readonly (string | { readonly key: string })[];

/** The line as plain words: for a readout, a test, or anywhere a key is a word. */
export const said = (line: HelpLine): string =>
  line.map((part) => (typeof part === 'string' ? part : part.key)).join('');
