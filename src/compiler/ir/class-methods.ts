import type { LoweringContext } from "./context.js";
import { type ClassInfo, type ClassMethodEntry, classCallableParameters, containsLexicalArguments } from "./class-info.js";
import ts from "typescript";
import type { JsIrBindingValue, JsIrFunctionParameter } from "./bindings.js";
import { type Produced, loweredPayload, produced, unsupportedIn } from "./lowered.js";
import type { JsIrOperation } from "./types.js";
import { CLASS_THIS_NAME, classAbortReason, classMethodFunctionName } from "./class-names.js";
import { functionFrameBindings } from "./function-parameters.js";
import { lowerFunctionParameters } from "./function-parameter-lowering.js";
import { isNonExecutableDeclaration } from "./comparisons.js";
import type { JsIrValueExpression } from "./expressions.js";
import { updateBindings } from "./binding-updates.js";
import { collectMethodEnclosingCaptureNames } from "./captures.js";
import { collectParameterBindingNames, withHoistedVars } from "./var-hoisting.js";
import { lowerSuspendableBody, suspendableKindFor } from "./state-machine.js";

function withClassMemberScope<T>(
  context: LoweringContext,
  info: ClassInfo,
  isStatic: boolean,
  run: () => T
): T {
  const previousThis = context.classThisInScope;
  const previousCtor = context.inClassConstructor;
  const previousClass = context.activeEnclosingClass;
  const previousStatic = context.activeClassMethodStatic;
  context.classThisInScope = true;
  context.inClassConstructor = false;
  context.activeEnclosingClass = info;
  context.activeClassMethodStatic = isStatic;
  try {
    return run();
  } finally {
    context.classThisInScope = previousThis;
    context.inClassConstructor = previousCtor;
    context.activeEnclosingClass = previousClass;
    context.activeClassMethodStatic = previousStatic;
  }
}

export function lowerClassAccessor(
  context: LoweringContext,
  info: ClassInfo,
  accessor: ts.AccessorDeclaration,
  functionName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>,
  isStatic = false
): Produced<JsIrOperation> {
  if (accessor.body === undefined) {
    return unsupportedIn("An accessor overload signature is not supported yet; only the implementation is lowered");
  }
  const { body: accessorBody } = accessor;
  const signature = classCallableParameters(accessor);
  if (signature.kind !== "lowered") {
    return signature;
  }
  const receiverBindings = functionFrameBindings(bindings);
  receiverBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });

  return withClassMemberScope(context, info, isStatic, () => {
    const parameters = lowerFunctionParameters(context, accessor.parameters, receiverBindings);
    if (parameters.kind !== "lowered") {
      return parameters;
    }
    const body = lowerClassMethodBody(context, accessorBody, parameters.operation.bindings);
    if (body.kind !== "lowered") {
      return body;
    }
    const fnParameters: JsIrFunctionParameter[] = [{ name: CLASS_THIS_NAME, valueKind: "value" }, ...parameters.operation.parameters];
    const captureNames = collectMethodEnclosingCaptureNames(context.typeChecker, accessor, accessorBody, [...accessor.parameters], bindings);
    return produced({ kind: "function", name: functionName, parameters: fnParameters, body: body.operation,
      ...(captureNames.length === 0 ? {} : { enclosingCaptureNames: [...captureNames] }) });
  });
}

export function lowerClassStaticBlock(
  context: LoweringContext,
  info: ClassInfo,
  block: ts.ClassStaticBlockDeclaration,
  functionName: string,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrOperation> {
  const receiverBindings = functionFrameBindings(bindings);
  receiverBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });

  return withClassMemberScope(context, info, true, () => {
    const body = lowerClassMethodBody(context, block.body, receiverBindings);
    if (body.kind !== "lowered") {
      return body;
    }
    const fnParameters: JsIrFunctionParameter[] = [{ name: CLASS_THIS_NAME, valueKind: "value" }];
    const captureNames = collectMethodEnclosingCaptureNames(context.typeChecker, block, block.body, [], bindings);
    return produced({
      kind: "function",
      name: functionName,
      parameters: fnParameters,
      body: body.operation,
      ...(captureNames.length === 0 ? {} : { enclosingCaptureNames: [...captureNames] })
    });
  });
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
  const { body: declarationBody } = declaration;
  const methodName = entry.name;
  const signature = classCallableParameters(declaration);
  if (signature.kind !== "lowered") {
    return signature;
  }
  const receiverBindings = functionFrameBindings(bindings);
  const fnParameters: JsIrFunctionParameter[] = [{ name: CLASS_THIS_NAME, valueKind: "value" }];
  receiverBindings.set(CLASS_THIS_NAME, { kind: "valueVariable", name: CLASS_THIS_NAME });

  return withClassMemberScope(context, info, isStatic, () => {
    const parameters = lowerFunctionParameters(context, declaration.parameters, receiverBindings);
    if (parameters.kind !== "lowered") {
      return parameters;
    }
    fnParameters.push(...parameters.operation.parameters);
    const paramNames = collectParameterBindingNames(declaration.parameters, [CLASS_THIS_NAME]);
    const usesArguments = !paramNames.has("arguments") && containsLexicalArguments(declarationBody);
    if (usesArguments) {
      parameters.operation.bindings.set("arguments", { kind: "valueVariable", name: "arguments" });
      paramNames.add("arguments");
    }
    const captureNames = collectMethodEnclosingCaptureNames(context.typeChecker, declaration, declarationBody, [...declaration.parameters], bindings)
      .filter((name) => !usesArguments || name !== "arguments");
    const suspendKind = suspendableKindFor(declaration);
    const body = suspendKind === undefined
      ? lowerClassMethodBody(context, declarationBody, parameters.operation.bindings)
      : lowerSuspendableBody(context, {
          kind: suspendKind,
          body: declarationBody,
          bindings: parameters.operation.bindings,
          outerParameterNames: paramNames,
          outerCaptureNames: captureNames,
          nameHint: `${info.name}_${methodName}`
        });
    if (body.kind !== "lowered") {
      return body;
    }
    return produced({
      kind: "function",
      name: classMethodFunctionName(info.name, methodName, isStatic),
      parameters: fnParameters,
      body: body.operation,
      ...(captureNames.length === 0 ? {} : { enclosingCaptureNames: [...captureNames] }),
      ...(usesArguments ? { usesArguments: true, argumentsStartIndex: 1 } : {})
    });
  });
}

function lowerClassMethodBody(
  context: LoweringContext,
  block: ts.Block,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<readonly JsIrOperation[]> {
  const bodyBindings = new Map(bindings);
  const parameterNames = ts.isFunctionLike(block.parent)
    ? collectParameterBindingNames(block.parent.parameters, [CLASS_THIS_NAME])
    : new Set<string>([CLASS_THIS_NAME]);
  return withHoistedVars(context, block.statements, bodyBindings, parameterNames, (preface) => {
    const operations: JsIrOperation[] = [...preface];
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
  });
}
