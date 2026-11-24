import { asJsGlobalName } from "./js-globals.js";
import { type Lowered, loweredPayload, notApplicable, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { LoweringContext } from "./context.js";
import ts from "typescript";
import { isUndefinedExpression } from "./predicates.js";
import { iteratorErrorSubject } from "./iterator-subject.js";
import type { JsIrBindingValue } from "./bindings.js";
import type { JsIrValueExpression } from "./expressions.js";
import { lowerStringExpression } from "./string-constants.js";
import { numberExpressionFromNumber } from "./number-constants.js";
import { lowerRegexValueExpression } from "./regex.js";
import { lowerFunctionObjectValue, lowerPlainConstructorArguments } from "./closures.js";
import { lowerOptionalChainValueExpression } from "./optional-chains.js";
import { classPrototypeName, resolveReceiverClass } from "./class-info.js";
import { isBoxedPrimitiveReceiver } from "./builtin-conditions.js";
import { lowerValueCallExpression, lowerValueConditionalExpression } from "./value-calls.js";
import { lowerJsonParseCall, lowerJsonStringifyCall } from "./json-values.js";
import { lowerArrayValueMethodCall } from "./array-values.js";
import { lowerRuntimeCollectionValueMethodCall } from "./collection-values.js";
import { lowerStringValueMethodCall } from "./string-methods.js";
import { lowerValuePropertyKeyExpression } from "./string-expressions.js";
import { classPrivateFieldWriteMessage } from "./class-names.js";
import { lowerClassExpressionValue } from "./classes.js";

// eslint-disable-next-line complexity, max-statements -- Direct JSValue lowering is centralized while the runtime ABI expands.
export function lowerDirectValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (ts.isMetaProperty(expression) && expression.keywordToken === ts.SyntaxKind.NewKeyword) {
    return produced(context.inClassConstructor ? { kind: "newTarget" } : { kind: "undefined" });
  }

  if (ts.isBigIntLiteral(expression)) {
    return produced({ kind: "bigIntLiteral", value: expression.text.replace(/[_n]/g, "") });
  }

  if (ts.isClassExpression(expression)) {
    return lowerClassExpressionValue(context, expression, bindings);
  }

  const bigIntUnary = lowerDynamicUnaryValueExpression(context, expression, bindings);
  if (bigIntUnary.kind !== "notApplicable") {
    return bigIntUnary;
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
        const operator: "&&" | "||" = expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? "&&" : "||";
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
    const assignmentValue = lowerAssignmentValueExpression(context, expression, bindings);
    if (assignmentValue.kind !== "notApplicable") {
      return assignmentValue;
    }
    const dynamicBinOp = lowerDynamicBinaryValueExpression(context, expression, bindings);
    if (dynamicBinOp.kind !== "notApplicable") {
      return dynamicBinOp;
    }
  }

  if (ts.isOptionalChain(expression) && !ts.isNonNullChain(expression)) {
    const optionalChain = lowerOptionalChainValueExpression(context, expression, bindings);
    if (optionalChain.kind !== "notApplicable") {
      return optionalChain;
    }
  }

  if (isUndefinedExpression(expression)) {
    return produced({ kind: "undefined" });
  }

  if (ts.isVoidExpression(expression)) {
    const inner = context.lowerValueExpression(context, expression.expression, bindings);
    if (inner.kind !== "lowered") {
      return inner;
    }
    return produced({ kind: "void", expression: inner.operation });
  }

  if (ts.isMetaProperty(expression) && expression.keywordToken === ts.SyntaxKind.ImportKeyword) {
    return produced({
      kind: "objectLiteralValue",
      value: {
        fields: [{
          kind: "field",
          key: { kind: "literal", value: "url" },
          value: { kind: "string", value: { kind: "literal", value: `file://${expression.getSourceFile().fileName}` } }
        }]
      }
    });
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isMetaProperty(expression.expression) &&
    expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    expression.name.text === "url"
  ) {
    return produced({ kind: "string", value: { kind: "literal", value: `file://${expression.getSourceFile().fileName}` } });
  }

  const propertyUpdate = lowerPropertyUpdateValueExpression(context, expression, bindings);
  if (propertyUpdate.kind !== "notApplicable") {
    return propertyUpdate;
  }

  if (ts.isNewExpression(expression) && ts.isIdentifier(expression.expression)) {
    const constructorName = expression.expression.text;
    if (constructorName === "Promise" && !bindings.has("Promise")) {
      const args = expression.arguments ?? [];
      if (args.length !== 1) {
        return unsupportedIn("`new Promise(...)` requires an executor function");
      }
      const executor = context.lowerValueExpression(context, args[0], bindings);
      if (executor.kind !== "lowered") {
        return withRefusal(executor, unsupportedIn("Executor argument to `new Promise(...)` must be an expression this build can evaluate"));
      }
      return produced({ kind: "promiseNew", executor: executor.operation });
    }
    if (constructorName === "Date" && !bindings.has("Date")) {
      const args = expression.arguments ?? [];
      if (args.length === 0) {
        return produced({ kind: "dateNew" });
      }
      if (args.length === 1) {
        const stringLiteral = lowerStringExpression(args[0], bindings);
        if (stringLiteral !== undefined) {
          return produced({ kind: "dateNew", milliseconds: numberExpressionFromNumber(Date.parse(stringLiteral)) });
        }
        const millis = context.lowerNumberExpression(context, args[0], bindings);
        if (millis.kind === "lowered") {
          return produced({ kind: "dateNew", milliseconds: millis.operation });
        }
        const coerced = context.lowerValueExpression(context, args[0], bindings);
        if (coerced.kind === "lowered") {
          return produced({ kind: "dateNew", milliseconds: { kind: "valueToNumber", value: coerced.operation } });
        }
        return withRefusal(coerced, unsupportedIn("Arguments to `new Date(...)` must be expressions this build can evaluate"));
      }
      return notApplicable;
    }
    const collectionKind = collectionConstructorKind(constructorName, bindings);
    if (collectionKind !== undefined) {
      return lowerCollectionConstructionValue(context, collectionKind, expression.arguments ?? [], bindings);
    }
    if (constructorName === "Uint8Array" && !bindings.has("Uint8Array")) {
      const args = expression.arguments ?? [];
      if (args.length === 0) {
        return produced({ kind: "uint8ArrayNew" });
      }
      if (args.length === 1) {
        const arg = context.lowerValueExpression(context, args[0], bindings);
        return arg.kind === "lowered" ? produced({ kind: "uint8ArrayNew", argument: arg.operation }) : arg;
      }
    }
    const constructor = bindings.get(constructorName);
    if (constructor?.kind === "function" && constructor.constructibleByObjectReturn === true) {
      const constructorArguments = expression.arguments ?? ts.factory.createNodeArray<ts.Expression>();
      const args = lowerPlainConstructorArguments(context, constructor.parameters, constructorArguments, bindings);
      if (args.kind !== "lowered") {
        return withRefusal(args, unsupportedIn(`Arguments to \`new ${constructorName}(...)\` must be expressions this build can evaluate`));
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
        return withRefusal(inner, unsupportedIn(`Arguments to \`new ${constructorName}(...)\` must be expressions this build can evaluate`));
      }
      return produced({ kind: "boxedPrimitive", inner: inner.operation, storeLength: constructorName === "String" });
    }
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    if (ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "Promise" && !bindings.has("Promise")) {
      const method = expression.expression.name.text;
      if (method === "resolve" || method === "reject" || method === "all" || method === "race" || method === "allSettled" || method === "any") {
        if (expression.arguments.length === 0) {
          return produced({ kind: "promiseStatic", method });
        }
        const argument = context.lowerValueExpression(context, expression.arguments[0], bindings);
        if (argument.kind !== "lowered") {
          return withRefusal(argument, unsupportedIn(`Argument to \`Promise.${method}(...)\` must be an expression this build can evaluate`));
        }
        return produced({ kind: "promiseStatic", method, argument: argument.operation });
      }
    }
    // Object.getPrototypeOf(instance) where instance is a class instance returns the prototype
    if (ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "Object" && expression.expression.name.text === "getPrototypeOf" && expression.arguments.length === 1) {
      const [target] = expression.arguments;
      const receiverClass = resolveReceiverClass(context, target, bindings);
      if (receiverClass !== undefined) {
        return produced({ kind: "variable", name: classPrototypeName(receiverClass.name) });
      }
    }
    const objectStaticValue = lowerObjectStaticValueCall(context, expression, bindings);
    if (objectStaticValue.kind !== "notApplicable") {
      return objectStaticValue;
    }
    const reflectValue = lowerReflectValueCall(context, expression, bindings);
    if (reflectValue.kind !== "notApplicable") {
      return reflectValue;
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
        if (!isBoxedPrimitiveReceiver(expression.expression.expression, bindings)) {
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
      return produced({
        kind: "taggedTemplateValue",
        tag: expression.tag.text,
        head: headText,
        middleTexts,
        expressions: middleExpressions
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
    if (binding === undefined) {
      const globalName = asJsGlobalName(expression.text);
      if (globalName !== undefined) {
        return produced({ kind: "nodeGlobal", name: globalName });
      }
    }
  }

  if (ts.isConditionalExpression(expression)) {
    return lowerValueConditionalExpression(context, expression, bindings);
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && !(expression.expression.text === "print" && !bindings.has("print"))) {
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

type ValueBinaryOperator = Extract<JsIrValueExpression, { readonly kind: "valueBinaryOp" }>["operator"];

const binaryTokenToValueOp: Readonly<Partial<Record<ts.SyntaxKind, ValueBinaryOperator>>> = {
  [ts.SyntaxKind.MinusToken]: "subtract",
  [ts.SyntaxKind.AsteriskToken]: "multiply",
  [ts.SyntaxKind.SlashToken]: "divide",
  [ts.SyntaxKind.PercentToken]: "modulo",
  [ts.SyntaxKind.AsteriskAsteriskToken]: "exponent",
  [ts.SyntaxKind.AmpersandToken]: "bitAnd",
  [ts.SyntaxKind.BarToken]: "bitOr",
  [ts.SyntaxKind.CaretToken]: "bitXor",
  [ts.SyntaxKind.LessThanLessThanToken]: "shiftLeft",
  [ts.SyntaxKind.GreaterThanGreaterThanToken]: "shiftRight",
  [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken]: "unsignedShiftRight"
};

const compoundTokenToValueOp: Readonly<Partial<Record<ts.SyntaxKind, ValueBinaryOperator>>> = {
  [ts.SyntaxKind.MinusEqualsToken]: "subtract",
  [ts.SyntaxKind.AsteriskEqualsToken]: "multiply",
  [ts.SyntaxKind.SlashEqualsToken]: "divide",
  [ts.SyntaxKind.PercentEqualsToken]: "modulo",
  [ts.SyntaxKind.AsteriskAsteriskEqualsToken]: "exponent",
  [ts.SyntaxKind.AmpersandEqualsToken]: "bitAnd",
  [ts.SyntaxKind.BarEqualsToken]: "bitOr",
  [ts.SyntaxKind.CaretEqualsToken]: "bitXor",
  [ts.SyntaxKind.LessThanLessThanEqualsToken]: "shiftLeft",
  [ts.SyntaxKind.GreaterThanGreaterThanEqualsToken]: "shiftRight",
  [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken]: "unsignedShiftRight"
};

function isBigIntExpression(expr: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(expr)) {
    return isBigIntExpression(expr.expression);
  }
  if (ts.isBigIntLiteral(expr)) {
    return true;
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "BigInt") {
    return true;
  }
  if (ts.isPrefixUnaryExpression(expr)) {
    return isBigIntExpression(expr.operand);
  }
  return ts.isBinaryExpression(expr) && (isBigIntExpression(expr.left) || isBigIntExpression(expr.right));
}

function lowerDynamicUnaryValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isPrefixUnaryExpression(expression)) {
    return notApplicable;
  }
  if (expression.operator !== ts.SyntaxKind.MinusToken && expression.operator !== ts.SyntaxKind.TildeToken) {
    return notApplicable;
  }
  if (context.typeChecker !== undefined && !isBigIntExpression(expression.operand)) {
    return notApplicable;
  }
  if (ts.isNumericLiteral(expression.operand)) {
    return notApplicable;
  }
  const operand = context.lowerValueExpression(context, expression.operand, bindings);
  if (operand.kind !== "lowered") {
    return operand;
  }
  const operator = expression.operator === ts.SyntaxKind.MinusToken ? "negate" : "bitNot";
  return produced({ kind: "valueUnaryOp", operator, value: operand.operation });
}

function lowerDynamicBinaryValueExpression(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const operator = binaryTokenToValueOp[expression.operatorToken.kind];
  if (operator === undefined) {
    return notApplicable;
  }
  if (context.typeChecker !== undefined && !isBigIntExpression(expression.left) && !isBigIntExpression(expression.right)) {
    return notApplicable;
  }
  const left = context.lowerValueExpression(context, expression.left, bindings);
  if (left.kind !== "lowered") {
    return left;
  }
  const right = context.lowerValueExpression(context, expression.right, bindings);
  if (right.kind !== "lowered") {
    return right;
  }
  return produced({ kind: "valueBinaryOp", operator, left: left.operation, right: right.operation });
}

const objectStateValueKinds: Readonly<Record<string, "objectFreeze" | "objectSeal" | "objectPreventExtensions" | undefined>> = {
  freeze: "objectFreeze",
  seal: "objectSeal",
  preventExtensions: "objectPreventExtensions"
};

function lowerPropertyUpdateValueExpression(
  context: LoweringContext,
  expression: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const isPrefix =
    ts.isPrefixUnaryExpression(expression) &&
    (expression.operator === ts.SyntaxKind.PlusPlusToken || expression.operator === ts.SyntaxKind.MinusMinusToken);
  const isPostfix = ts.isPostfixUnaryExpression(expression);
  if (!isPrefix && !isPostfix) {
    return notApplicable;
  }
  const { operand } = expression;
  const operator = expression.operator === ts.SyntaxKind.PlusPlusToken ? "increment" : "decrement";
  if (ts.isIdentifier(operand) && bindings.get(operand.text)?.kind === "valueVariable") {
    return produced({ kind: "variableUpdateValue", name: operand.text, operator, prefix: isPrefix });
  }
  if (!ts.isPropertyAccessExpression(operand) && !ts.isElementAccessExpression(operand)) {
    return notApplicable;
  }
  if (ts.isPropertyAccessExpression(operand) && ts.isPrivateIdentifier(operand.name)) {
    return notApplicable;
  }
  const receiver = context.lowerValueExpression(context, operand.expression, bindings);
  if (receiver.kind !== "lowered") {
    return receiver;
  }
  const key = ts.isPropertyAccessExpression(operand)
    ? produced({ kind: "literal" as const, value: operand.name.text })
    : lowerValuePropertyKeyExpression(context, operand.argumentExpression, bindings);
  if (key.kind !== "lowered") {
    return key;
  }
  return produced({ kind: "propertyUpdateValue", receiver: receiver.operation, key: key.operation, operator, prefix: isPrefix });
}

function collectionConstructorKind(
  constructorName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): "map" | "set" | "weakMap" | "weakSet" | undefined {
  if (bindings.has(constructorName)) {
    return undefined;
  }
  const map: Readonly<Record<string, "map" | "set" | "weakMap" | "weakSet" | undefined>> = {
    Map: "map",
    Set: "set",
    WeakMap: "weakMap",
    WeakSet: "weakSet"
  };
  return map[constructorName];
}

function lowerCollectionConstructionValue(
  context: LoweringContext,
  collectionKind: "map" | "set" | "weakMap" | "weakSet",
  args: readonly ts.Expression[],
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (args.length === 0) {
    return produced({ kind: "collectionNewValue", collectionKind });
  }
  if (args.length === 1) {
    const iterable = context.lowerValueExpression(context, args[0], bindings);
    if (iterable.kind !== "lowered") {
      return iterable;
    }
    return produced({
      kind: "collectionNewValue",
      collectionKind,
      iterable: iterable.operation,
      notIterableMessage: `${iteratorErrorSubject(args[0])} is not iterable`
    });
  }
  return notApplicable;
}

function lowerObjectStaticValueCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression) ||
    expression.expression.expression.text !== "Object" || bindings.has("Object")) {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  const stateKind = objectStateValueKinds[method];
  if (stateKind !== undefined && expression.arguments.length === 1) {
    const arg = context.lowerValueExpression(context, expression.arguments[0], bindings);
    return arg.kind === "lowered" ? produced({ kind: stateKind, value: arg.operation }) : arg;
  }
  if (method === "assign" && expression.arguments.length > 0) {
    const target = context.lowerValueExpression(context, expression.arguments[0], bindings);
    if (target.kind !== "lowered") {
      return target;
    }
    const sources: JsIrValueExpression[] = [];
    for (const sourceExpr of expression.arguments.slice(1)) {
      const lowered = context.lowerValueExpression(context, sourceExpr, bindings);
      if (lowered.kind !== "lowered") {
        return lowered;
      }
      sources.push(lowered.operation);
    }
    return produced({ kind: "objectAssignValue", target: target.operation, sources });
  }
  if (isObjectEnumerateMethod(method) && expression.arguments.length === 1) {
    const target = context.lowerValueExpression(context, expression.arguments[0], bindings);
    return target.kind === "lowered" ? produced({ kind: "objectEnumerateValue", method, target: target.operation }) : target;
  }
  return notApplicable;
}

function isObjectEnumerateMethod(name: string): name is "keys" | "values" | "entries" | "getOwnPropertyNames" {
  return name === "keys" || name === "values" || name === "entries" || name === "getOwnPropertyNames";
}

function lowerReflectValueCall(
  context: LoweringContext,
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (!ts.isPropertyAccessExpression(expression.expression) || !ts.isIdentifier(expression.expression.expression) ||
    expression.expression.expression.text !== "Reflect" || bindings.has("Reflect")) {
    return notApplicable;
  }
  const method = expression.expression.name.text;
  if ((method === "get" || method === "has") && expression.arguments.length >= 2) {
    const target = context.lowerValueExpression(context, expression.arguments[0], bindings);
    if (target.kind !== "lowered") {
      return target;
    }
    const key = lowerValuePropertyKeyExpression(context, expression.arguments[1], bindings);
    if (key.kind !== "lowered") {
      return key;
    }
    if (method === "get") {
      return produced({ kind: "valueObjectDynamicAccess", value: target.operation, key: key.operation });
    }
    return produced({ kind: "boolean", value: { kind: "valueHasProperty", value: target.operation, key: key.operation } });
  }
  return notApplicable;
}

function lowerAssignmentValueExpression(
  context: LoweringContext,
  expression: ts.BinaryExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const { kind } = expression.operatorToken;
  if (kind === ts.SyntaxKind.EqualsToken) {
    return lowerDirectValueStore(context, expression.left, expression.right, bindings);
  }
  if (
    kind === ts.SyntaxKind.QuestionQuestionEqualsToken ||
    kind === ts.SyntaxKind.BarBarEqualsToken ||
    kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken
  ) {
    const current = context.lowerValueExpression(context, expression.left, bindings);
    if (current.kind !== "lowered") {
      return current;
    }
    const store = lowerDirectValueStore(context, expression.left, expression.right, bindings);
    if (store.kind !== "lowered") {
      return store;
    }
    if (kind === ts.SyntaxKind.QuestionQuestionEqualsToken) {
      return produced({ kind: "nullishCoalesce", left: current.operation, right: store.operation });
    }
    const operator: "&&" | "||" = kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ? "&&" : "||";
    return produced({ kind: "logicalValue", operator, left: current.operation, right: store.operation });
  }
  const compoundOp = compoundTokenToValueOp[kind];
  if (kind !== ts.SyntaxKind.PlusEqualsToken && compoundOp === undefined) {
    return notApplicable;
  }
  const current = context.lowerValueExpression(context, expression.left, bindings);
  if (current.kind !== "lowered") {
    return current;
  }
  const right = context.lowerValueExpression(context, expression.right, bindings);
  if (right.kind !== "lowered") {
    return right;
  }
  const combined: JsIrValueExpression = compoundOp === undefined
    ? { kind: "valuePlus", left: current.operation, right: right.operation }
    : { kind: "valueBinaryOp", operator: compoundOp, left: current.operation, right: right.operation };
  return lowerDirectValueStoreValue(context, expression.left, combined, bindings);
}

function lowerDirectValueStore(
  context: LoweringContext,
  target: ts.Expression,
  right: ts.Expression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  const value = context.lowerValueExpression(context, right, bindings);
  if (value.kind !== "lowered") {
    return value;
  }
  return lowerDirectValueStoreValue(context, target, value.operation, bindings);
}

function lowerDirectValueStoreValue(
  context: LoweringContext,
  target: ts.Expression,
  value: JsIrValueExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (ts.isIdentifier(target)) {
    const binding = bindings.get(target.text);
    const isMutable = binding?.kind === "valueVariable" || binding?.kind === "stringVariable" || binding?.kind === "booleanVariable" ||
      (binding?.kind === "number" && binding.value.kind === "variable");
    return isMutable ? produced({ kind: "assignVariableValue", name: target.text, value }) : notApplicable;
  }
  if (ts.isPropertyAccessExpression(target)) {
    return lowerPropertyValueStoreExpression(context, target, value, bindings);
  }
  if (ts.isElementAccessExpression(target)) {
    const receiver = context.lowerValueExpression(context, target.expression, bindings);
    if (receiver.kind !== "lowered") {
      return receiver;
    }
    const key = lowerValuePropertyKeyExpression(context, target.argumentExpression, bindings);
    return key.kind === "lowered"
      ? produced({ kind: "propertyStoreValue", receiver: receiver.operation, key: key.operation, value })
      : key;
  }
  return notApplicable;
}

function lowerPropertyValueStoreExpression(
  context: LoweringContext,
  target: ts.PropertyAccessExpression,
  value: JsIrValueExpression,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered<JsIrValueExpression> {
  if (ts.isPrivateIdentifier(target.name)) {
    const enclosing = context.activeEnclosingClass;
    const fieldName = target.name.text;
    const storageKey = enclosing?.privateFields.get(fieldName) ?? enclosing?.staticPrivateFields.get(fieldName);
    if (storageKey === undefined) {
      return notApplicable;
    }
    const receiver = context.lowerValueExpression(context, target.expression, bindings);
    return receiver.kind === "lowered"
      ? produced({ kind: "privateFieldStoreValue", receiver: receiver.operation, key: storageKey, message: classPrivateFieldWriteMessage(fieldName), value })
      : receiver;
  }
  const receiver = context.lowerValueExpression(context, target.expression, bindings);
  return receiver.kind === "lowered"
    ? produced({ kind: "propertyStoreValue", receiver: receiver.operation, key: { kind: "literal", value: target.name.text }, value })
    : receiver;
}
