// The screens' source read as TypeScript reads it, for the tests that hold the
// design system to the code. Parsed rather than matched with a pattern, so a
// comment is never mistaken for code, nor `accept="image/*"` for a comment.
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Both screens and `@tt/ui`: everything a GM or a player sees drawn. */
export const SCREENS = ['apps/gm/src', 'apps/table/src', 'packages/ui/src'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

export const screenSources = (): string[] => SCREENS.flatMap((dir) => files(join(ROOT, dir)));

export const parse = (path: string, text = readFileSync(path, 'utf8')): ts.SourceFile =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** Every node of a file, depth first. */
export function nodes(file: ts.SourceFile): ts.Node[] {
  const out: ts.Node[] = [];
  const visit = (node: ts.Node) => { out.push(node); node.forEachChild(visit); };
  visit(file);
  return out;
}

/** The words a file draws: its JSX text and its strings, with no comments among them. */
export function drawnText(file: ts.SourceFile): { line: number; text: string }[] {
  return nodes(file)
    .filter((node) => ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
    .map((node) => ({ line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: node.getText() }));
}

/** Each JSX element's tag and the attributes it is given by name. */
export function jsxAttributes(file: ts.SourceFile): { line: number; tag: string; name: string }[] {
  return nodes(file).filter(ts.isJsxAttribute).map((attribute) => {
    const element = attribute.parent.parent as ts.JsxOpeningElement | ts.JsxSelfClosingElement;
    return {
      line: file.getLineAndCharacterOfPosition(attribute.getStart()).line + 1,
      tag: element.tagName.getText(),
      name: attribute.name.getText(),
    };
  });
}
