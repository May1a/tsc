import { type Lowered, notApplicable, produced } from "./lowered.js";
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
 * enabled flag is checked before anything else: a file using it in a build without the runtime compiled
 * in has to say so rather than emit a call to a symbol that does not exist.
 *
 * `InlineCppCompilation` is that state, owned by the one `lowerToJsIr` invocation that created it.
 * Both fields used to be module-level, so the flag outlived the file it was set for and the block list
 * was reachable from anywhere in the process; now a compilation carries both, and two compilations
 * running in the same process cannot enable or contaminate each other. The blocks array is the array
 * the result hands back, so there is exactly one list per compilation and nothing has to be collected
 * afterwards.
 */
export interface InlineCppCompilation {
  readonly enabled: boolean;
  readonly blocks: JsIrInlineCppBlock[];
}

export function createInlineCppCompilation(enabled: boolean): InlineCppCompilation {
  return { enabled, blocks: [] };
}

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
export function inlineCppDisabledDiagnostic(
  inlineCpp: InlineCppCompilation,
  sourceFile: ts.SourceFile
): CompilerDiagnostic | undefined {
  if (inlineCpp.enabled) {
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
export function lowerInlineCppValueExpression(
  inlineCpp: InlineCppCompilation,
  expression: ts.Expression
): Lowered<JsIrValueExpression> {
  if (!isInlineCppTaggedTemplate(expression) || !ts.isNoSubstitutionTemplateLiteral(expression.template)) {
    return notApplicable;
  }
  if (!inlineCpp.enabled) {
    return notApplicable;
  }
  const symbol = `__tscn_cpp_${inlineCpp.blocks.length}`;
  inlineCpp.blocks.push({ symbol, code: rawNoSubstitutionTemplateText(expression.template) });
  return produced({ kind: "inlineCppValue", symbol });
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
