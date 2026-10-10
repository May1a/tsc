import type { OperationHandlers } from "./operations.js";
import { declareFromOperation, optional, resolveCallArguments, resolveFunctionParameters, resolveRuntimeArrayElement, resolveSwitchClause } from "./payloads.js";

export const controlHandlers = {
  print: (node, resolver) => ({ ...node, expression: resolver.expression(node.expression) }),
  throwValue: (node, resolver) => ({ ...node, value: resolver.value(node.value) }),
  block: (node, resolver) => ({
    ...node,
    operations: resolver.state.inScope("block", () => resolver.operations(node.operations))
  }),

  bindingGroup: (node, resolver) => ({ ...node, operations: resolver.operations(node.operations) }),

  tryCatch: (node, resolver) => {
    const { state } = resolver;
    const tryOperations = state.inScope("block", () => resolver.operations(node.tryOperations));
    const caught = state.inScope("catch", () => ({
      catchVariable: node.catchVariable === ""
        ? undefined
        : declareFromOperation(node.catchVariable, "catch", node, resolver),
      operations: resolver.operations(node.catchOperations)
    }));
    const finallyOperations =
      node.finallyOperations === undefined
        ? undefined
        : state.inScope("block", () => resolver.operations(node.finallyOperations ?? []));
    return {
      ...node,
      tryOperations,
      catchVariable: caught.catchVariable,
      catchOperations: caught.operations,
      finallyOperations
    };
  },

  if: (node, resolver) => ({
    ...node,
    condition: resolver.condition(node.condition),
    thenOperations: resolver.state.inScope("block", () => resolver.operations(node.thenOperations)),
    elseOperations: resolver.state.inScope("block", () => resolver.operations(node.elseOperations))
  }),

  switch: (node, resolver) => ({
    ...node,
    expression: resolver.value(node.expression),
    clauses: resolver.state.inScope("block", () => {
      resolver.predeclare(node.clauses.flatMap((clause) => clause.operations));
      return node.clauses.map((clause) => resolveSwitchClause(clause, resolver));
    })
  }),

  while: (node, resolver) => ({
    ...node,
    condition: resolver.condition(node.condition),
    body: resolver.state.inScope("loop", () => resolver.operations(node.body))
  }),
  doWhile: (node, resolver) => ({
    ...node,
    condition: resolver.condition(node.condition),
    body: resolver.state.inScope("loop", () => resolver.operations(node.body))
  }),

  // The initializer's declarations are visible to the condition, the increment and the body, so all
  // four sit inside one scope.
  for: (node, resolver) => ({
    ...node,
    ...resolver.state.inScope("loop", () => ({
      initializer: resolver.operations(node.initializer),
      condition: resolver.condition(node.condition),
      increment: resolver.operation(node.increment),
      body: resolver.operations(node.body)
    }))
  }),

  forOfArray: (node, resolver) => ({
    ...node,
    ...resolver.state.inScope("loop", () => ({
      itemName: declareFromOperation(node.itemName, "loopItem", node, resolver),
      arrayName: resolver.reference(node.arrayName),
      body: resolver.operations(node.body)
    }))
  }),
  forOfString: (node, resolver) => ({
    ...node,
    ...resolver.state.inScope("loop", () => ({
      itemName: declareFromOperation(node.itemName, "loopItem", node, resolver),
      source: resolver.string(node.source),
      body: resolver.operations(node.body)
    }))
  }),
  forOfSet: (node, resolver) => ({
    ...node,
    ...resolver.state.inScope("loop", () => ({
      itemName: declareFromOperation(node.itemName, "loopItem", node, resolver),
      setName: resolver.reference(node.setName),
      body: resolver.operations(node.body)
    }))
  }),
  forOfMap: (node, resolver) => ({
    ...node,
    ...resolver.state.inScope("loop", () => ({
      itemName: declareFromOperation(node.itemName, "loopItem", node, resolver),
      mapName: resolver.reference(node.mapName),
      body: resolver.operations(node.body)
    }))
  }),
  forOfProtocol: (node, resolver) => ({
    ...node,
    ...resolver.state.inScope("loop", () => ({
      itemName: declareFromOperation(node.itemName, "loopItem", node, resolver),
      iterable: resolver.value(node.iterable),
      body: resolver.operations(node.body)
    }))
  }),
  forInObject: (node, resolver) => ({
    ...node,
    ...resolver.state.inScope("loop", () => ({
      itemName: declareFromOperation(node.itemName, "loopItem", node, resolver),
      objectName: resolver.reference(node.objectName),
      body: resolver.operations(node.body)
    }))
  }),
  forInArray: (node, resolver) => ({
    ...node,
    ...resolver.state.inScope("loop", () => ({
      itemName: declareFromOperation(node.itemName, "loopItem", node, resolver),
      arrayName: resolver.reference(node.arrayName),
      body: resolver.operations(node.body)
    }))
  }),

  break: (node) => ({ ...node }),
  continue: (node) => ({ ...node }),

  function: (node, resolver) => {
    const { state } = resolver;
    const name = state.hoisted(node.name);
    const enclosingCaptureNames =
      node.enclosingCaptureNames === undefined
        ? undefined
        : node.enclosingCaptureNames.map((capture) => state.reference(capture));
    const frame = state.inFunction((functionId) => {
      for (const capture of enclosingCaptureNames ?? []) state.capture(capture);
      return { functionId, parameters: resolveFunctionParameters(node.parameters, resolver), body: resolver.operations(node.body) };
    });
    return {
      ...node,
      name,
      functionId: frame.functionId,
      parameters: frame.parameters,
      body: frame.body,
      enclosingCaptureNames
    };
  },

  call: (node, resolver) => ({
    ...node,
    name: resolver.reference(node.name),
    arguments: resolveCallArguments(node.arguments, resolver)
  }),
  callValue: (node, resolver) => ({
    ...node,
    callee: resolver.value(node.callee),
    arguments: resolveCallArguments(node.arguments, resolver),
    thisValue: optional(node.thisValue, resolver.value),
    methodReceiver: optional(node.methodReceiver, resolver.value),
    methodKey: optional(node.methodKey, resolver.string),
    spreadArguments: optional(node.spreadArguments, (elements) => elements.map((element) => resolveRuntimeArrayElement(element, resolver))),
  }),
  // An external C++ symbol: a generated code name, not a binding.
  inlineCpp: (node) => ({ ...node }),

  returnNumber: (node, resolver) => ({ ...node, expression: resolver.number(node.expression) }),
  returnString: (node, resolver) => ({ ...node, expression: resolver.string(node.expression) }),
  returnValue: (node, resolver) => ({ ...node, expression: resolver.value(node.expression) }),

  returnClosure: (node, resolver) => {
    const { state } = resolver;
    const captures = node.captures.map((capture) => state.reference(capture));
    const frame = state.inFunction((functionId) => {
      for (const capture of captures) state.capture(capture);
      return { functionId, parameters: node.parameters.map((parameter) => state.declare(parameter, "parameter", { kind: "value" })),
        body: resolver.operations(node.body) };
    });
    state.recordClosureFunction(node.functionName, frame.functionId);
    return { ...node, captures, functionId: frame.functionId, parameters: frame.parameters, body: frame.body };
  }
} satisfies Partial<OperationHandlers>;
