// A line of words with keys in it (D-388): each key drawn as a `<kbd>`, which
// the host's stylesheet colours as a tool slot's number is coloured. Leans on
// the host's global `kbd` rule, as `ConfirmDelete` leans on `button.quiet`
// (R-111).

export interface WithKeysProps {
  /** The words, and the keys among them: `[{ key: 'Q/E' }, ' turn']`. */
  readonly line: readonly (string | { readonly key: string })[];
}

export function WithKeys({ line }: WithKeysProps) {
  return <>{line.map((part, i) => (typeof part === 'string' ? part : <kbd key={i}>{part.key}</kbd>))}</>;
}
