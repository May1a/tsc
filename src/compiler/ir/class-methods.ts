import type { LoweringContext } from "./context.js";
import { type ClassInfo, type ClassMethodEntry, classCallableParameters } from "./class-info.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrFunctionParameter } from "./bindings.js";
import { type Produced, loweredPayload, produced, unsupportedIn } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import { CLASS_THIS_NAME, classAbortReason, classMethodFunctionName } from "./class-names.js";
import { bindFunctionParameter, functionFrameBindings } from "./function-parameters.js";
import { isNonExecutableDeclaration } from "./comparisons.js";
import type { JsIrValueExpression } from "./expressions.js";
import { updateBindings } from "./binding-updates.js";

export function lowerClassAccessor(
  context: LoweringContext,
  info: ClassInfo,
  accessor: ts.AccessorDeclaration,
  functionName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  if (accessor.body === undefined) {
    return unsupportedIn("An accessor overload signature is not supported yet; only the implementation is lowered");
  }
  const parameters = classCallableParameters(accessor);
  if (parameters.kind !== "lowered") {
    return parameters;
  }
  const fnParameters: JsIrFunctionParameter[] = [
    { name: CLASS_THIS_NAME, valueKind: "value" },
    ...parameters.operation
  ];
  const fnBindings = functionFrameBindings(bindings);
  fnBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  for (const parameter of parameters.operation) {
    bindFunctionParameter(parameter.name, parameter.valueKind, false, fnBindings);
  }

  const previousThis = context.classThisInScope;
  const previousClass = context.activeEnclosingClass;
  const previousStatic = context.activeClassMethodStatic;
  context.classThisInScope = true;
  context.activeEnclosingClass = info;
  context.activeClassMethodStatic = false;
  try {
    const body = lowerClassMethodBody(context, accessor.body, fnBindings);
    if (body.kind !== "lowered") {
      return body;
    }
    return produced({ kind: "function", name: functionName, parameters: fnParameters, body: body.operation });
  } finally {
    context.classThisInScope = previousThis;
    context.activeEnclosingClass = previousClass;
    context.activeClassMethodStatic = previousStatic;
  }
}

export function lowerClassMethod(
  context: LoweringContext,
  info: ClassInfo,
  entry: ClassMethodEntry,
  isStatic: boolean,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const { declaration } = entry;
  // `collectClassMembers` drops a method with no body, so this cannot be reached from a class this
  // compiler collected. The guard turns a regression in that filter into a named diagnostic instead of
  // an `undefined` block somewhere in emission, and it is the only narrowing of `body` in the tier.
  if (declaration.body === undefined) {
    return unsupportedIn("A method with no body reached emission; the class tier should have dropped it as an overload signature");
  }
  const methodName = entry.name;
  const parameters = classCallableParameters(declaration);
  if (parameters.kind !== "lowered") {
    return parameters;
  }
  const fnBindings = functionFrameBindings(bindings);
  const fnParameters: JsIrFunctionParameter[] = [];
  if (!isStatic) {
    fnParameters.push({ name: CLASS_THIS_NAME, valueKind: "value" });
    fnBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });
  }
  for (const parameter of parameters.operation) {
    fnParameters.push(parameter);
    bindFunctionParameter(parameter.name, parameter.valueKind, false, fnBindings);
  }

  const previousThis = context.classThisInScope;
  const previousClass = context.activeEnclosingClass;
  const previousStatic = context.activeClassMethodStatic;
  context.classThisInScope = !isStatic;
  context.activeEnclosingClass = info;
  context.activeClassMethodStatic = isStatic;
  try {
    const body = lowerClassMethodBody(context, declaration.body, fnBindings);
    if (body.kind !== "lowered") {
      return body;
    }
    return produced({
      kind: "function",
      name: classMethodFunctionName(info.name, methodName, isStatic),
      parameters: fnParameters,
      body: body.operation
    });
  } finally {
    context.classThisInScope = previousThis;
    context.activeEnclosingClass = previousClass;
    context.activeClassMethodStatic = previousStatic;
  }
}

// result so method calls are uniformly value-typed at their call sites.
function lowerClassMethodBody(
  context: LoweringContext,
  block: ts.Block,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<readonly JsIrOperation[]> {
  const operations: JsIrOperation[] = [];
  const bodyBindings = new Map(bindings);
  for (const statement of block.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }
    if (ts.isReturnStatement(statement)) {
      let value: JsIrValueExpression | undefined = { kind: "undefined" };
      if (statement.expression !== undefined) {
        const valueExpressionResult = context.lowerValueExpression(context, statement.expression, bodyBindings);
        if (valueExpressionResult.kind === "unsupported") {
          return valueExpressionResult;
        }
        value = loweredPayload(valueExpressionResult);
      }
      if (value === undefined) {
        return unsupportedIn("The return value in a class member body is not an expression this build can evaluate");
      }
      operations.push({ kind: "returnValue", expression: value });
      continue;
    }
    const result = context.lowerStatement(context, statement, bodyBindings);
    if (result.kind !== "lowered") {
      return unsupportedIn(classAbortReason(result));
    }
    operations.push(result.operation);
    updateBindings(result.operation, bodyBindings);
  }
  return produced(operations);
}
