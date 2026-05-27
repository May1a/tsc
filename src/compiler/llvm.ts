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
  hasNumberPrint: boolean;
  printIndex: number;
  ifIndex: number;
  cmpIndex: number;
  numIndex: number;
  callIndex: number;
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
    hasNumberPrint: false,
    printIndex: 0,
    ifIndex: 0,
    cmpIndex: 0,
    numIndex: 0,
    callIndex: 0
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
  } else if (operation.kind === "constString") {
    context.bindings.set(operation.name, { kind: "string", value: operation.value });
  } else if (operation.kind === "function") {
    const outerBindings = new Map(context.bindings);
    const hasReturn = operation.body.some((op) => op.kind === "return");
    let returnType = "void";
    if (hasReturn) {
      returnType = "double";
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
    hasNumberPrint: context.hasNumberPrint,
    printIndex: context.printIndex,
    ifIndex: 0,
    cmpIndex: 0,
    numIndex: 0,
    callIndex: 0
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
  if (operation.kind === "constNumber") {
    context.bindings.set(operation.name, { kind: "number", value: operation.value });
    return [];
  }

  if (operation.kind === "constBoolean") {
    context.bindings.set(operation.name, { kind: "boolean", value: operation.value });
    return [];
  }

  if (operation.kind === "constString") {
    context.bindings.set(operation.name, { kind: "string", value: operation.value });
    return [];
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

  return [];
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

export const emitTraceMap = (module: JsIrModule): string =>
  JSON.stringify(
    {
      entry: module.entry,
      modules: module.modules
    },
    undefined,
    2
  );
