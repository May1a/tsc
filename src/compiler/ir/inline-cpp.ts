import ts from "typescript";
import type { JsIrInlineCppBlock } from "./module.js";
import type { CompilerDiagnostic } from "../diagnostics.js";
import { sourceSpan } from "./class-info.js";
import { isInlineCppTaggedTemplate } from "./predicates.js";
import type { JsIrValueExpression } from "./expressions.js";

/**
 * The inline C++ escape hatch, and the state that turns it on.
 *
 * A `` __tscn_inline_cpp` tag ` marks a template whose body is C++ rather than JavaScript. The compiler
 * does not lower it — it passes the text to clang verbatim and links the result — which is why the
 * enabled flag is per-file and checked before anything else: a file using it in a build without the
 * runtime compiled in has to say so rather than emit a call to a symbol that does not exist.
 *
 * The flag and the collected blocks were two loose module-level `let`s, and an ES module binding cannot
 * be assigned from outside its module — so they could not be cut out at all. One `inlineCppState`
 * object is the same state with a name on it. `lowerToJsIr` sets it around the statement list and clears
 * it afterwards, so one file's use does not enable the next.
 */

export const inlineCppState: {
  enabled: boolean;
  blocks: JsIrInlineCppBlock[] | undefined;
} = { enabled: false, blocks: undefined };

export const inlineCppTag = "__tscn_inline_cpp";
export function findInlineCppTaggedTemplate(sourceFile: ts.SourceFile): ts.TaggedTemplateExpression | undefined {
  let found: ts.TaggedTemplateExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined) {
      return;
    }
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === inlineCppTag) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
export function inlineCppDisabledDiagnostic(sourceFile: ts.SourceFile): CompilerDiagnostic | undefined {
  if (inlineCppState.enabled) {
    return undefined;
  }
  const node = findInlineCppTaggedTemplate(sourceFile);
  if (node === undefined) {
    return undefined;
  }
  return {
    code: "TSCN1003",
    category: "error",
    message: "Inline C++ requires -fcpp",
    span: sourceSpan(sourceFile, node.getStart(sourceFile))
  };
}
export function lowerInlineCppValueExpression(expression: ts.Expression): JsIrValueExpression | undefined {
  if (!isInlineCppTaggedTemplate(expression) || !ts.isNoSubstitutionTemplateLiteral(expression.template)) {
    return undefined;
  }
  if (!inlineCppState.enabled || inlineCppState.blocks === undefined) {
    return undefined;
  }
  const symbol = `__tscn_cpp_${inlineCppState.blocks.length}`;
  inlineCppState.blocks.push({ symbol, code: rawNoSubstitutionTemplateText(expression.template) });
  return { kind: "inlineCppValue", symbol };
}
export function rawNoSubstitutionTemplateText(template: ts.NoSubstitutionTemplateLiteral): string {
  const sourceFile = template.getSourceFile();
  const start = template.getStart(sourceFile);
  const end = template.getEnd();
  if (sourceFile.text[start] === "`" && sourceFile.text[end - 1] === "`") {
    return sourceFile.text.slice(start + 1, end - 1);
  }
  return template.text;
}
