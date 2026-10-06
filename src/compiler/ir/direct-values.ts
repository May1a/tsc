import { unsupportedFormMessage } from "./builtins/manifest.js";
import { type Lowered, loweredPayload, notApplicable, produced, unsupportedIn } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import { lowerRegexValueExpression } from "./regex.js";
import { lowerFunctionObjectValue, lowerPlainConstructorArguments } from "./closures.js";
import { lowerOptionalChainValueExpression } from "./optional-chains.js";
import { classPrototypeName, resolveReceiverClass } from "./class-info.js";
import { lowerBoxedPrimitiveReceiver } from "./builtin-conditions.js";
import { lowerValueCallExpression, lowerValueConditionalExpression } from "./value-calls.js";
import { lowerJsonParseCall, lowerJsonStringifyCall } from "./json-values.js";
import { lowerArrayValueMethodCall } from "./array-values.js";
import { lowerRuntimeCollectionValueMethodCall } from "./collection-values.js";
import { lowerStringValueMethodCall } from "./string-methods.js";

// eslint-disable-next-line complexity, max-statements -- Direct JSValue lowering is centralized while the runtime ABI expands.
export function lowerDirectValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (ts.isMetaProperty(expression) && expression.keywordToken === ts.SyntaxKind.NewKeyword) {
    return unsupportedIn(unsupportedFormMessage("new-target"));
  }

  const regex = lowerRegexValueExpression(context, expression, bindings);
  if (regex.kind !== "notApplicable") {
    return regex;
  }
  const functionValue = lowerFunctionObjectValue(context, expression, bindings);
  if (functionValue.kind !== "notApplicable") {
    return functionValue;
  }

  if (ts.isBinaryExpression(expression)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const leftResult = context.lowerValueExpression(context, expression.left, bindings);
      if (leftResult.kind === "unsupported") {
        return leftResult;
      }
      const left = loweredPayload(leftResult);
      const rightResult = context.lowerValueExpression(context, expression.right, bindings);
      if (rightResult.kind === "unsupported") {
        return rightResult;
      }
      const right = loweredPayload(rightResult);
      if (left !== undefined && right !== undefined) {
        return produced({ kind: "valuePlus", left, right });
      }
    }
    if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || expression.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      const leftResult2 = context.lowerValueExpression(context, expression.left, bindings);
      if (leftResult2.kind === "unsupported") {
        return leftResult2;
      }
      const left = loweredPayload(leftResult2);
      const rightResult2 = context.lowerValueExpression(context, expression.right, bindings);
      if (rightResult2.kind === "unsupported") {
        return rightResult2;
      }
      const right = loweredPayload(rightResult2);
      if (left !== undefined && right !== undefined) {
        let operator: "&&" | "||" = "||";
        if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
          operator = "&&";
        }
        return produced({ kind: "logicalValue", operator, left, right });
      }
    }
    if (expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      const leftResult3 = context.lowerValueExpression(context, expression.left, bindings);
      if (leftResult3.kind === "unsupported") {
        return leftResult3;
      }
      const left = loweredPayload(leftResult3);
      const rightResult3 = context.lowerValueExpression(context, expression.right, bindings);
      if (rightResult3.kind === "unsupported") {
        return rightResult3;
      }
      const right = loweredPayload(rightResult3);
      if (left !== undefined && right !== undefined) {
        return produced({ kind: "nullishCoalesce", left, right });
      }
    }
  }

  if (ts.isOptionalChain(expression) && !ts.isNonNullChain(expression)) {
    const optionalChain = lowerOptionalChainValueExpression(context, expression, bindings);
    if (optionalChain.kind !== "notApplicable") {
      return optionalChain;
    }
  }

  if (expression.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(expression) && expression.text === "undefined")) {
    return produced({ kind: "undefined" });
  }

  if (ts.isVoidExpression(expression)) {
    const inner = context.lowerValueExpression(context, expression.expression, bindings);
    if (inner.kind !== "lowered") {
      return inner;
    }
    return produced({ kind: "void", expression: inner.operation });
  }

  if (ts.isNewExpression(expression) && ts.isIdentifier(expression.expression)) {
    const constructorName = expression.expression.text;
    const constructor = bindings.get(constructorName);
    if (constructor?.kind === "function" && constructor.constructibleByObjectReturn === true) {
      const constructorArguments = expression.arguments ?? ts.factory.createNodeArray<ts.Expression>();
      const args = lowerPlainConstructorArguments(context, constructor.parameters, constructorArguments, bindings);
      if (args.kind !== "lowered") {
        return args;
      }
      return produced({ kind: "call", name: constructorName, arguments: args.operation });
    }
    if (constructorName === "Number" || constructorName === "Boolean" || constructorName === "String") {
      const args = expression.arguments ?? [];
      if (args.length !== 1) {
        return notApplicable;
      }
      const inner = context.lowerValueExpression(context, args[0], bindings);
      if (inner.kind !== "lowered") {
        return inner;
      }
      return produced({ kind: "boxedPrimitive", inner: inner.operation, storeLength: constructorName === "String" });
    }
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    // Object.getPrototypeOf(instance) where instance is a class instance returns the prototype
    if (ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "Object" && expression.expression.name.text === "getPrototypeOf" && expression.arguments.length === 1) {
      const [target] = expression.arguments;
      const receiverClass = resolveReceiverClass(target, bindings);
      if (receiverClass !== undefined) {
        return produced({ kind: "variable", name: classPrototypeName(receiverClass.name) });
      }
    }
    if (expression.arguments.length === 0) {
      const method = expression.expression.name.text;
      if (method === "valueOf" || method === "toString") {
        // Only a boxed primitive. `boxedValueOf` and `boxedToString` read the receiver's single
        // stored value, which is the primitive for a boxed Number/Boolean/String and *not* what
        // `Object.prototype` promises: on a plain runtime object `o.toString()` returned the first
        // own property's value and `o.valueOf()` returned it too, where JavaScript returns
        // "[object Object]" and the object. A plain object now declines and is reported, rather
        // than compiled to the wrong answer.
        if (lowerBoxedPrimitiveReceiver(expression.expression.expression, bindings) === undefined) {
          return notApplicable;
        }
        const receiver = context.lowerValueExpression(context, expression.expression.expression, bindings);
        if (receiver.kind !== "lowered") {
          return receiver;
        }
        return produced({ kind: "boxedMethodCall", receiver: receiver.operation, method });
      }
    }
  }

  if (ts.isTaggedTemplateExpression(expression) && ts.isIdentifier(expression.tag)) {
    const tagBinding = bindings.get(expression.tag.text);
    if (tagBinding?.kind === "function") {
      const { template } = expression;
      if (ts.isNoSubstitutionTemplateLiteral(template)) {
        const value = context.lowerStringRuntimeExpression(context, template, bindings);
        if (value.kind !== "lowered") {
          return value;
        }
        return produced({ kind: "string", value: value.operation });
      }
      const headText = template.head.text;
      const middleTexts: string[] = [];
      const middleExpressions: JsIrValueExpression[] = [];
      for (const span of template.templateSpans) {
        middleTexts.push(span.literal.text);
        const exprValue = context.lowerValueExpression(context, span.expression, bindings);
        if (exprValue.kind !== "lowered") {
          return exprValue;
        }
        middleExpressions.push(exprValue.operation);
      }
      const hasRest = tagBinding.parameters.some((parameter) => parameter.isRest === true);
      return produced({
        kind: "taggedTemplateValue",
        tag: expression.tag.text,
        head: headText,
        middleTexts,
        expressions: middleExpressions,
        wrapValuesInRest: hasRest
      });
    }
  }

  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    const leftResult4 = context.lowerValueExpression(context, expression.left, bindings);
    if (leftResult4.kind === "unsupported") {
      return leftResult4;
    }
    const left = loweredPayload(leftResult4);
    const rightResult4 = context.lowerValueExpression(context, expression.right, bindings);
    if (rightResult4.kind === "unsupported") {
      return rightResult4;
    }
    const right = loweredPayload(rightResult4);
    if (left !== undefined && right !== undefined) {
      return produced({ kind: "sequence", left, right });
    }
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return produced({ kind: "null" });
  }

  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (binding?.kind === "value") {
      return produced(binding.value);
    }
    if (binding?.kind === "valueVariable") {
      return produced({ kind: "variable", name: binding.name });
    }
  }

  if (ts.isConditionalExpression(expression)) {
    return lowerValueConditionalExpression(context, expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text !== "print") {
    return lowerValueCallExpression(context, expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const jsonParse = lowerJsonParseCall(context, expression, bindings);
    if (jsonParse.kind !== "notApplicable") {
      return jsonParse;
    }
    const jsonStringify = lowerJsonStringifyCall(context, expression, bindings);
    if (jsonStringify.kind !== "notApplicable") {
      return jsonStringify;
    }
    const arrayMethod = lowerArrayValueMethodCall(context, expression, bindings);
    if (arrayMethod.kind !== "notApplicable") {
      return arrayMethod;
    }
    const collectionMethod = lowerRuntimeCollectionValueMethodCall(context, expression, bindings);
    if (collectionMethod.kind !== "notApplicable") {
      return collectionMethod;
    }
    const stringMethod = lowerStringValueMethodCall(context, expression, bindings);
    if (stringMethod.kind !== "notApplicable") {
      return stringMethod;
    }
  }

  return notApplicable;
}
