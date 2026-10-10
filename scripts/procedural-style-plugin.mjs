function singleStatement(node) {
  if (node?.type === "BlockStatement") {
    return node.body.length === 1 ? node.body[0] : undefined;
  }
  return node;
}

function assignmentIn(node, name) {
  const statement = singleStatement(node);
  const expression = statement?.type === "ExpressionStatement" ? statement.expression : undefined;
  if (expression?.type === "AssignmentExpression" && expression.operator === "=" &&
    expression.left.type === "Identifier" && expression.left.name === name) {
    return expression;
  }
  return;
}

function nextStatement(node) {
  const statements = node.parent.body;
  return Array.isArray(statements) ? statements[statements.indexOf(node) + 1] : undefined;
}

const preferConstInitialization = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      initialize: "Initialize '{{name}}' with a const conditional expression instead of assigning it across branches.",
    },
  },
  create(context) {
    return {
      VariableDeclaration(node) {
        if (node.kind !== "let" || node.declarations.length !== 1) {
          return;
        }
        const [declaration] = node.declarations;
        const branch = nextStatement(node);
        if (declaration.id.type !== "Identifier" || branch?.type !== "IfStatement") {
          return;
        }
        const consequent = assignmentIn(branch.consequent, declaration.id.name);
        const alternate = assignmentIn(branch.alternate, declaration.id.name);
        // A default with effects must still run before the condition and selected branch.
        const literalDefault = declaration.init?.type === "Literal" && !declaration.init.regex;
        if (consequent === undefined ||
          !(declaration.init === null && alternate !== undefined || literalDefault && branch.alternate === null)) {
          return;
        }
        const [variable] = context.sourceCode.getDeclaredVariables(node);
        const writes = new Set([declaration.id, consequent.left, alternate?.left]);
        // Keep genuinely mutable variables, self-dependent assignments, and captured state.
        if (variable.references.some((reference) =>
          reference.isWrite() === true && !writes.has(reference.identifier) ||
          reference.isRead() === true && reference.identifier.start < branch.end ||
          reference.from.variableScope !== variable.scope.variableScope)) {
          return;
        }
        context.report({ node, messageId: "initialize", data: { name: declaration.id.name } });
      },
    };
  },
};

function arrayAppendCall(loop) {
  const statement = singleStatement(loop.body);
  const call = statement?.type === "ExpressionStatement" ? statement.expression : undefined;
  if (call?.type !== "CallExpression" || call.arguments.length === 0 || call.optional) {
    return;
  }
  const member = call.callee;
  if (member.type !== "MemberExpression" || member.computed || member.optional ||
    member.property.name !== "push" || member.object.type !== "Identifier") {
    return;
  }
  return call;
}

function findVariable(scope, name) {
  return scope.set.get(name) ?? (scope.upper === null ? undefined : findVariable(scope.upper, name));
}

function containsSuspension(node, visitorKeys) {
  if (node.type === "AwaitExpression" || node.type === "YieldExpression") {
    return true;
  }
  return visitorKeys[node.type].some((key) => {
    const children = Array.isArray(node[key]) ? node[key] : [node[key]];
    return children.some((child) => child !== null && child !== undefined && containsSuspension(child, visitorKeys));
  });
}

const preferArrayTransform = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      transform: "Initialize '{{name}}' with map, flatMap, or Array.from instead of a push-only loop.",
    },
  },
  create(context) {
    return {
      ForOfStatement(loop) {
        if (loop.await || loop.left.type !== "VariableDeclaration" || loop.left.kind !== "const") {
          return;
        }
        const call = arrayAppendCall(loop);
        if (call === undefined || containsSuspension(call, context.sourceCode.visitorKeys)) {
          return;
        }
        const target = call.callee.object;
        const variable = findVariable(context.sourceCode.getScope(loop), target.name);
        const definition = variable?.defs[0];
        if (definition?.type !== "Variable" || definition.node.init?.type !== "ArrayExpression" ||
          definition.node.init.elements.length > 0) {
          return;
        }
        // Only initialization loops. Appending to an existing output can be order-sensitive.
        if (variable.references.some((reference) =>
          reference.from.variableScope !== variable.scope.variableScope ||
          reference.identifier !== definition.node.id && reference.identifier.start < loop.end && reference.identifier !== target)) {
          return;
        }
        context.report({ node: loop, messageId: "transform", data: { name: target.name } });
      },
    };
  },
};

const globalTypeNames = new Set([
  "Error", "String", "Number", "Boolean", "Object", "Array", "Promise", "Map", "Set",
  "Symbol", "Date", "RegExp", "Function", "BigInt", "ReadonlyArray", "ReadonlyMap", "ReadonlySet"
]);

const noShadowedGlobalTypeParameter = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      shadow: "Type parameter '{{name}}' hides the global type. Choose a domain name such as TFailure or TElement.",
    },
  },
  create(context) {
    return {
      TSTypeParameter(node) {
        const name = typeof node.name === "string" ? node.name : node.name.name;
        if (globalTypeNames.has(name)) {
          context.report({ node, messageId: "shadow", data: { name } });
        }
      },
    };
  },
};

function failureSource(node, sourceCode, scope, seen = new Set()) {
  if (node.type === "MemberExpression" && !node.computed &&
    ["cause", "failureOption", "failureOrCause"].includes(node.property.name)) {
    return true;
  }
  if (node.type === "Identifier") {
    const variable = findVariable(scope, node.name);
    const definition = variable?.defs[0];
    if (definition?.type === "Variable" && definition.node.init !== null && !seen.has(variable)) {
      seen.add(variable);
      return failureSource(definition.node.init, sourceCode, variable.scope, seen);
    }
    return false;
  }
  return (sourceCode.visitorKeys[node.type] ?? []).some((key) => {
    const children = Array.isArray(node[key]) ? node[key] : [node[key]];
    return children.some((child) => child !== null && child !== undefined && failureSource(child, sourceCode, scope, seen));
  });
}

const noAssertionOnErrorCause = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      narrow: "Narrow the failure with instanceof or a discriminant. A type assertion can hide another failure in the error channel.",
    },
  },
  create(context) {
    const assertion = (node) => {
      if (failureSource(node.expression, context.sourceCode, context.sourceCode.getScope(node))) {
        context.report({ node, messageId: "narrow" });
      }
    };
    return { TSAsExpression: assertion, TSTypeAssertion: assertion };
  },
};

export default {
  meta: { name: "tscn" },
  rules: {
    "prefer-const-initialization": preferConstInitialization,
    "prefer-array-transform": preferArrayTransform,
    "no-shadowed-global-type-parameter": noShadowedGlobalTypeParameter,
    "no-assertion-on-error-cause": noAssertionOnErrorCause,
  },
};
