import type {
  JsIrBindingValue,
  JsIrCondition,
  JsIrExpression,
  JsIrModule,
  JsIrNumberExpression,
  JsIrNumberOperator,
  JsIrOperation
} from "./ir.js";

type EmitContext = {
  readonly bindings: Map<string, JsIrBindingValue>;
  readonly stringConstants: string[];
  readonly loopLabels: LoopLabels[];
  hasNumberPrint: boolean;
  printIndex: number;
  ifIndex: number;
  cmpIndex: number;
  numIndex: number;
  callIndex: number;
  loopIndex: number;
  logicIndex: number;
  boolIndex: number;
};

type LoopLabels = {
  readonly breakLabel: string;
  readonly continueLabel: string;
};

type FunctionDef = {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly body: readonly JsIrOperation[];
  readonly outerBindings: Map<string, JsIrBindingValue>;
  returnType: string;
};

const doubleQuoteByte = 34;
const backslashByte = 92;
const firstPrintableAsciiByte = 32;
const lastPrintableAsciiByte = 126;
const hexadecimalRadix = 16;
const noLines = 0;

const encodeCString = (value: string): { readonly value: string; readonly length: number } => {
  const bytes = [...Buffer.from(value, "utf8"), 0];
  const encoded = bytes
    .map((byte) => {
      if (byte === doubleQuoteByte) {
        return String.raw`\22`;
      }

      if (byte === backslashByte) {
        return String.raw`\5C`;
      }

      if (byte >= firstPrintableAsciiByte && byte <= lastPrintableAsciiByte) {
        return String.fromCharCode(byte);
      }

      return `\\${byte.toString(hexadecimalRadix).toUpperCase().padStart(2, "0")}`;
    })
    .join("");

  return {
    value: encoded,
    length: bytes.length
  };
};

export const emitLlvmIr = (module: JsIrModule): string => {
  const moduleComments = module.modules
    .map((sourceModule) => `; source ${sourceModule.fileName} statements=${sourceModule.statementCount}`)
    .join("\n");
  const context: EmitContext = {
    bindings: new Map(),
    stringConstants: [],
    loopLabels: [],
    hasNumberPrint: false,
    printIndex: 0,
    ifIndex: 0,
    cmpIndex: 0,
    numIndex: 0,
    callIndex: 0,
    loopIndex: 0,
    logicIndex: 0,
    boolIndex: 0
  };
  const functionDefs: FunctionDef[] = [];
  const mainOps: JsIrOperation[] = [];

  for (const sourceModule of module.modules) {
    for (const op of sourceModule.operations) {
      classifyAndProcessOperation(op, context, functionDefs, mainOps);
    }
  }

  const fnLines = functionDefs
    .flatMap((fn) => emitFunctionDefinition(fn, context))
    .join("\n");
  const forwardDeclarations = functionDefs
    .map((fn) => {
      const params = fn.parameters.map(() => "double").join(", ");
      return `declare ${fn.returnType} @${fn.name}(${params})`;
    })
    .join("\n");
  const mainLines = emitOperations(mainOps, context);
  const stringConstants = context.stringConstants.join("\n");
  let numberFormat = "";
  if (context.hasNumberPrint) {
    numberFormat = String.raw`@.fmt.number = private unnamed_addr constant [4 x i8] c"%g\0A\00"`;
  }

  let mainBody = "";
  if (mainLines.length > noLines) {
    mainBody = `${mainLines.join("\n")}\n`;
  }

  return `; tscn textual LLVM IR placeholder
; entry ${module.entry}
${moduleComments}

target triple = "x86_64-unknown-linux-gnu"

declare i32 @puts(ptr)
declare i32 @printf(ptr, ...)

${numberFormat}
${stringConstants}
${forwardDeclarations}
${fnLines}
define i32 @main() {
entry:
${mainBody}  ret i32 0
}
`;
};

function classifyAndProcessOperation(
  operation: JsIrOperation,
  context: EmitContext,
  functionDefs: FunctionDef[],
  mainOps: JsIrOperation[]
): void {
  if (operation.kind === "constNumber") {
    context.bindings.set(operation.name, { kind: "number", value: operation.value });
  } else if (operation.kind === "constBoolean") {
    context.bindings.set(operation.name, { kind: "boolean", value: operation.value });
  } else if (operation.kind === "constBooleanExpression") {
    context.bindings.set(operation.name, { kind: "booleanExpression", value: operation.value });
  } else if (operation.kind === "constClosure") {
    context.bindings.set(operation.name, { kind: "closure", value: operation.value });
  } else if (operation.kind === "constString") {
    context.bindings.set(operation.name, { kind: "string", value: operation.value });
  } else if (operation.kind === "letNumber") {
    context.bindings.set(operation.name, { kind: "number", value: { kind: "variable", name: operation.name } });
  } else if (operation.kind === "function") {
    const outerBindings = new Map(context.bindings);
    const returnClosure = operation.body.find((op) => op.kind === "returnClosure");
    if (returnClosure?.kind === "returnClosure") {
      functionDefs.push({
        name: returnClosure.functionName,
        parameters: [...returnClosure.captures, ...returnClosure.parameters],
        body: returnClosure.body,
        outerBindings: new Map(),
        returnType: "double"
      });
    }
    const hasReturn = operation.body.some((op) => op.kind === "return");
    let returnType = "void";
    if (hasReturn) {
      returnType = "double";
    }
    if (returnClosure !== undefined) {
      returnType = "ptr";
    }
    functionDefs.push({
      name: operation.name,
      parameters: operation.parameters,
      body: operation.body,
      outerBindings,
      returnType
    });
    return;
  }

  mainOps.push(operation);
}

function emitFunctionDefinition(fn: FunctionDef, context: EmitContext): string[] {
  const paramList = fn.parameters.map((_p, i) => `double %p${i}`).join(", ");
  const lines: string[] = [`define ${fn.returnType} @${fn.name}(${paramList}) {`];
  const fnContext: EmitContext = {
    bindings: new Map(fn.outerBindings),
    stringConstants: context.stringConstants,
    loopLabels: [],
    hasNumberPrint: context.hasNumberPrint,
    printIndex: context.printIndex,
    ifIndex: 0,
    cmpIndex: 0,
    numIndex: 0,
    callIndex: 0,
    loopIndex: 0,
    logicIndex: 0,
    boolIndex: 0
  };
  for (let i = 0; i < fn.parameters.length; i++) {
    fnContext.bindings.set(fn.parameters[i], {
      kind: "number",
      value: { kind: "parameter", name: `%p${i}` }
    });
  }
  const bodyLines = emitOperations(fn.body, fnContext);
  context.printIndex = fnContext.printIndex;
  if (bodyLines.length > noLines) {
    lines.push("entry:", ...bodyLines);
  } else {
    lines.push("entry:");
  }
  if (fn.returnType === "void") {
    lines.push("  ret void");
  }
  lines.push("}", "");
  return lines;
}

function emitOperations(operations: readonly JsIrOperation[], context: EmitContext): string[] {
  const lines: string[] = [];

  for (const operation of operations) {
    const emitted = emitOperation(operation, context);
    lines.push(...emitted);
  }

  return lines;
}

function emitOperation(operation: JsIrOperation, context: EmitContext): string[] {
  const bindingLines = emitBindingOperation(operation, context);
  if (bindingLines !== undefined) {
    return bindingLines;
  }

  const loopLines = emitLoopControlOperation(operation, context);
  if (loopLines !== undefined) {
    return loopLines;
  }

  if (operation.kind === "print") {
    return emitExpressionPrint(operation.expression, context);
  }

  if (operation.kind === "if") {
    return emitIfOperation(operation, context);
  }

  if (operation.kind === "call") {
    return emitCallOperation(operation, context);
  }

  if (operation.kind === "return") {
    return emitReturnOperation(operation, context);
  }

  if (operation.kind === "returnClosure") {
    return ["  ret ptr null"];
  }

  return [];
}

function emitBindingOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  if (operation.kind === "constNumber") {
    context.bindings.set(operation.name, { kind: "number", value: operation.value });
    return [];
  }

  if (operation.kind === "constBoolean") {
    context.bindings.set(operation.name, { kind: "boolean", value: operation.value });
    return [];
  }

  if (operation.kind === "constBooleanExpression") {
    context.bindings.set(operation.name, { kind: "booleanExpression", value: operation.value });
    return [];
  }

  if (operation.kind === "constClosure") {
    context.bindings.set(operation.name, { kind: "closure", value: operation.value });
    return [];
  }

  if (operation.kind === "constString") {
    context.bindings.set(operation.name, { kind: "string", value: operation.value });
    return [];
  }

  if (operation.kind === "letNumber") {
    return emitLetNumberOperation(operation, context);
  }

  if (operation.kind === "assignNumber") {
    return emitAssignNumberOperation(operation, context);
  }

  return undefined;
}

function emitLoopControlOperation(operation: JsIrOperation, context: EmitContext): string[] | undefined {
  if (operation.kind === "while") {
    return emitWhileOperation(operation, context);
  }

  if (operation.kind === "for") {
    return emitForOperation(operation, context);
  }

  if (operation.kind === "break") {
    return emitBreakOperation(context);
  }

  if (operation.kind === "continue") {
    return emitContinueOperation(context);
  }

  return undefined;
}

function variablePointerName(name: string): string {
  return `%${name}.addr`;
}

function emitLetNumberOperation(
  operation: Extract<JsIrOperation, { readonly kind: "letNumber" }>,
  context: EmitContext
): string[] {
  const result = emitNumberExpression(operation.value, context);
  const pointer = variablePointerName(operation.name);
  context.bindings.set(operation.name, { kind: "number", value: { kind: "variable", name: pointer } });
  return [...result.lines, `  ${pointer} = alloca double`, `  store double ${result.value}, ptr ${pointer}`];
}

function emitAssignNumberOperation(
  operation: Extract<JsIrOperation, { readonly kind: "assignNumber" }>,
  context: EmitContext
): string[] {
  const binding = context.bindings.get(operation.name);
  if (binding?.kind !== "number" || binding.value.kind !== "variable") {
    return [];
  }

  const result = emitNumberExpression(operation.value, context);
  return [...result.lines, `  store double ${result.value}, ptr ${binding.value.name}`];
}

function emitCallOperation(operation: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrNumberExpression[] }, context: EmitContext): string[] {
  const returnType = "void";
  const lines: string[] = [];
  const argValues: string[] = [];
  for (const arg of operation.arguments) {
    const result = emitNumberExpression(arg, context);
    lines.push(...result.lines);
    argValues.push(`double ${result.value}`);
  }
  const args = argValues.join(", ");
  lines.push(`  call ${returnType} @${operation.name}(${args})`);
  return lines;
}

function emitCallExpressionResult(expression: { readonly kind: "call"; readonly name: string; readonly arguments: readonly JsIrNumberExpression[] }, context: EmitContext): { readonly lines: string[]; readonly value: string } {
  const lines: string[] = [];
  const argValues: string[] = [];
  for (const arg of expression.arguments) {
    const result = emitNumberExpression(arg, context);
    lines.push(...result.lines);
    argValues.push(`double ${result.value}`);
  }
  const args = argValues.join(", ");
  const index = context.callIndex;
  context.callIndex += 1;
  const name = `%call.${index}`;
  lines.push(`  ${name} = call double @${expression.name}(${args})`);
  return { lines, value: name };
}

function emitReturnOperation(operation: { readonly kind: "return"; readonly expression: JsIrNumberExpression }, context: EmitContext): string[] {
  const result = emitNumberExpression(operation.expression, context);
  return [...result.lines, `  ret double ${result.value}`];
}

function emitExpressionPrint(expression: JsIrExpression, context: EmitContext): string[] {
  if (expression.kind === "string") {
    return [emitStringPrint(expression.value, context)];
  }

  if (expression.kind === "number") {
    const result = emitNumberExpression(expression.value, context);
    return [...result.lines, emitNumberPrint(result.value, context)];
  }

  if (expression.kind === "boolean") {
    return [emitStringPrint(String(expression.value), context)];
  }

  if (expression.kind === "call") {
    const result = emitCallExpressionResult(expression, context);
    return [...result.lines, emitNumberPrint(result.value, context)];
  }

  const binding = context.bindings.get(expression.name);
  if (binding === undefined) {
    return [];
  }

  return emitBindingPrint(binding, context);
}

function emitBindingPrint(binding: JsIrBindingValue, context: EmitContext): string[] {
  if (binding.kind === "number") {
    const result = emitNumberExpression(binding.value, context);
    return [...result.lines, emitNumberPrint(result.value, context)];
  }

  if (binding.kind === "boolean") {
    return [emitStringPrint(String(binding.value), context)];
  }

  if (binding.kind === "booleanExpression") {
    const result = emitCondition(binding.value, context);
    return [...result.lines, ...emitBooleanValuePrint(result.value, context)];
  }

  if (binding.kind !== "string") {
    return [];
  }

  return [emitStringPrint(binding.value, context)];
}

function emitIfOperation(operation: Extract<JsIrOperation, { readonly kind: "if" }>, context: EmitContext): string[] {
  const {condition, thenOperations, elseOperations} = operation;
  const {ifIndex} = context;
  context.ifIndex += 1;
  const thenLabel = `if.then.${ifIndex}`;
  const elseLabel = `if.else.${ifIndex}`;
  const endLabel = `if.end.${ifIndex}`;
  let falseLabel = endLabel;
  if (elseOperations.length > noLines) {
    falseLabel = elseLabel;
  }
  const emittedCondition = emitCondition(condition, context);
  const lines = [
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${thenLabel}, label %${falseLabel}`,
    `${thenLabel}:`
  ];

  lines.push(...emitOperationsWithScopedBindings(thenOperations, context));
  lines.push(`  br label %${endLabel}`);

  if (elseOperations.length > noLines) {
    lines.push(`${elseLabel}:`);
    lines.push(...emitOperationsWithScopedBindings(elseOperations, context));
    lines.push(`  br label %${endLabel}`);
  }

  lines.push(`${endLabel}:`);
  return lines;
}

function emitWhileOperation(operation: Extract<JsIrOperation, { readonly kind: "while" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `while.cond.${loopIndex}`;
  const bodyLabel = `while.body.${loopIndex}`;
  const endLabel = `while.end.${loopIndex}`;
  const emittedCondition = emitCondition(operation.condition, context);
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: condLabel });
  const bodyLines = emitOperations(operation.body, context);
  context.loopLabels.pop();

  return [
    `  br label %${condLabel}`,
    `${condLabel}:`,
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...bodyLines,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

function emitForOperation(operation: Extract<JsIrOperation, { readonly kind: "for" }>, context: EmitContext): string[] {
  const { loopIndex } = context;
  context.loopIndex += 1;
  const condLabel = `for.cond.${loopIndex}`;
  const bodyLabel = `for.body.${loopIndex}`;
  const stepLabel = `for.step.${loopIndex}`;
  const endLabel = `for.end.${loopIndex}`;
  const initializerLines = emitOperation(operation.initializer, context);
  const emittedCondition = emitCondition(operation.condition, context);
  context.loopLabels.push({ breakLabel: endLabel, continueLabel: stepLabel });
  const bodyLines = emitOperations(operation.body, context);
  context.loopLabels.pop();
  const incrementLines = emitOperation(operation.increment, context);

  return [
    ...initializerLines,
    `  br label %${condLabel}`,
    `${condLabel}:`,
    ...emittedCondition.lines,
    `  br i1 ${emittedCondition.value}, label %${bodyLabel}, label %${endLabel}`,
    `${bodyLabel}:`,
    ...bodyLines,
    `  br label %${stepLabel}`,
    `${stepLabel}:`,
    ...incrementLines,
    `  br label %${condLabel}`,
    `${endLabel}:`
  ];
}

function emitBreakOperation(context: EmitContext): string[] {
  const labels = context.loopLabels.at(-1);
  if (labels === undefined) {
    return [];
  }

  return [`  br label %${labels.breakLabel}`];
}

function emitContinueOperation(context: EmitContext): string[] {
  const labels = context.loopLabels.at(-1);
  if (labels === undefined) {
    return [];
  }

  return [`  br label %${labels.continueLabel}`];
}

function emitCondition(
  condition: JsIrCondition,
  context: EmitContext
): { readonly lines: readonly string[]; readonly value: string } {
  if (condition.kind === "boolean") {
    return {
      lines: [],
      value: String(condition.value)
    };
  }

  if (condition.kind === "negate") {
    const inner = emitCondition(condition.condition, context);
    const index = context.cmpIndex;
    context.cmpIndex += 1;
    const name = `%cmp.${index}`;
    return {
      lines: [...inner.lines, `  ${name} = xor i1 ${inner.value}, true`],
      value: name
    };
  }

  if (condition.kind === "and" || condition.kind === "or") {
    return emitLogicalCondition(condition, context);
  }

  const index = context.cmpIndex;
  context.cmpIndex += 1;
  const name = `%cmp.${index}`;
  const left = emitNumberExpression(condition.left, context);
  const right = emitNumberExpression(condition.right, context);

  return {
    lines: [...left.lines, ...right.lines, `  ${name} = ${llvmComparisonInstruction(condition.operator)} double ${left.value}, ${right.value}`],
    value: name
  };
}

function emitLogicalCondition(
  condition: Extract<JsIrCondition, { readonly kind: "and" | "or" }>,
  context: EmitContext
): { readonly lines: readonly string[]; readonly value: string } {
  const index = context.logicIndex;
  context.logicIndex += 1;
  const leftLabel = `logic.left.${index}`;
  const rhsLabel = `logic.rhs.${index}`;
  const endLabel = `logic.end.${index}`;
  const left = emitCondition(condition.left, context);
  const right = emitCondition(condition.right, context);
  const value = `%logic.${index}`;
  let shortCircuitValue = "true";
  let leftTrueLabel = endLabel;
  let leftFalseLabel = rhsLabel;
  if (condition.kind === "and") {
    shortCircuitValue = "false";
    leftTrueLabel = rhsLabel;
    leftFalseLabel = endLabel;
  }

  return {
    lines: [
      `  br label %${leftLabel}`,
      `${leftLabel}:`,
      ...left.lines,
      `  br i1 ${left.value}, label %${leftTrueLabel}, label %${leftFalseLabel}`,
      `${rhsLabel}:`,
      ...right.lines,
      `  br label %${endLabel}`,
      `${endLabel}:`,
      `  ${value} = phi i1 [ ${shortCircuitValue}, %${leftLabel} ], [ ${right.value}, %${rhsLabel} ]`
    ],
    value
  };
}

function llvmComparisonInstruction(operator: "===" | "!==" | "<" | "<=" | ">" | ">="): string {
  switch (operator) {
    case "===": {
      return "fcmp oeq";
    }
    case "!==": {
      return "fcmp one";
    }
    case "<": {
      return "fcmp olt";
    }
    case "<=": {
      return "fcmp ole";
    }
    case ">": {
      return "fcmp ogt";
    }
    case ">=": {
      return "fcmp oge";
    }
  }

  const unsupported: never = operator;
  void unsupported;
  throw new Error("Unsupported comparison operator");
}

function emitNumberExpression(
  expression: JsIrNumberExpression,
  context: EmitContext
): { readonly lines: readonly string[]; readonly value: string } {
  if (expression.kind === "literal") {
    return {
      lines: [],
      value: String(expression.value)
    };
  }

  if (expression.kind === "parameter") {
    const binding = context.bindings.get(expression.name);
    if (binding?.kind === "number" && binding.value.kind === "parameter") {
      return {
        lines: [],
        value: binding.value.name
      };
    }
    return {
      lines: [],
      value: expression.name
    };
  }

  if (expression.kind === "variable") {
    const binding = context.bindings.get(expression.name);
    let pointer = expression.name;
    if (binding?.kind === "number" && binding.value.kind === "variable") {
      pointer = binding.value.name;
    }
    const index = context.numIndex;
    context.numIndex += 1;
    const name = `%num.${index}`;

    return {
      lines: [`  ${name} = load double, ptr ${pointer}`],
      value: name
    };
  }

  if (expression.kind === "call") {
    return emitCallExpressionResult(expression, context);
  }

  if (expression.kind === "unary") {
    const value = emitNumberExpression(expression.value, context);
    const index = context.numIndex;
    context.numIndex += 1;
    const name = `%num.${index}`;

    return {
      lines: [...value.lines, `  ${name} = fneg double ${value.value}`],
      value: name
    };
  }

  const left = emitNumberExpression(expression.left, context);
  const right = emitNumberExpression(expression.right, context);
  const index = context.numIndex;
  context.numIndex += 1;
  const name = `%num.${index}`;

  return {
    lines: [...left.lines, ...right.lines, `  ${name} = ${llvmNumberOperator(expression.operator)} double ${left.value}, ${right.value}`],
    value: name
  };
}

function llvmNumberOperator(operator: JsIrNumberOperator): string {
  switch (operator) {
    case "add": {
      return "fadd";
    }
    case "subtract": {
      return "fsub";
    }
    case "multiply": {
      return "fmul";
    }
    case "divide": {
      return "fdiv";
    }
  }

  const unsupported: never = operator;
  void unsupported;
  throw new Error("Unsupported number operator");
}

function emitOperationsWithScopedBindings(operations: readonly JsIrOperation[], context: EmitContext): string[] {
  const previousBindings = new Map(context.bindings);
  const lines = emitOperations(operations, context);
  context.bindings.clear();
  for (const [name, value] of previousBindings) {
    context.bindings.set(name, value);
  }
  return lines;
}

function emitStringPrint(value: string, context: EmitContext): string {
  const index = context.printIndex;
  context.printIndex += 1;
  const encoded = encodeCString(value);
  context.stringConstants.push(`@.str.${index} = private unnamed_addr constant [${encoded.length} x i8] c"${encoded.value}"`);
  return `  %print.${index} = call i32 @puts(ptr @.str.${index})`;
}

function emitNumberPrint(value: string, context: EmitContext): string {
  const index = context.printIndex;
  context.printIndex += 1;
  context.hasNumberPrint = true;
  return `  %print.${index} = call i32 (ptr, ...) @printf(ptr @.fmt.number, double ${value})`;
}

function emitBooleanValuePrint(value: string, context: EmitContext): string[] {
  const index = context.boolIndex;
  context.boolIndex += 1;
  const truePrint = emitStringPrint("true", context);
  const falsePrint = emitStringPrint("false", context);
  const trueLabel = `bool.true.${index}`;
  const falseLabel = `bool.false.${index}`;
  const endLabel = `bool.end.${index}`;

  return [
    `  br i1 ${value}, label %${trueLabel}, label %${falseLabel}`,
    `${trueLabel}:`,
    truePrint,
    `  br label %${endLabel}`,
    `${falseLabel}:`,
    falsePrint,
    `  br label %${endLabel}`,
    `${endLabel}:`
  ];
}

export const emitTraceMap = (module: JsIrModule): string =>
  JSON.stringify(
    {
      entry: module.entry,
      modules: module.modules
    },
    undefined,
    2
  );
