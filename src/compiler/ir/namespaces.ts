import type { LoweringContext } from "./context.js";
import ts from "typescript";
import type { JsIrBindingValue } from "./bindings.js";
import { type Lowered, type Produced, loweredOperation, produced, unsupportedIn, withRefusal } from "./lowered.js";
import type { JsIrRuntimeObjectField, JsIrRuntimeObjectValue } from "./expressions.js";
import { isNonExecutableDeclaration } from "./comparisons.js";

/**
 * A namespace lowered to the object its exported members describe.
 *
 * A `namespace` declares a name whose value is an object of its exports, which is the shape an object
 * literal already produces, so the desugaring is that literal rather than a runtime namespace object.
 * This is the plan's "an object literal" reading; the IIFE wrapper TypeScript emits is the half that has
 * no representation here, and it is also the half that would let a non-exported declaration stay local.
 */
function lowerNamespaceValue(
  context: LoweringContext,
  declaration: ts.ModuleDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrRuntimeObjectValue> {
  const { name: declaredName, body } = declaration;
  if (!ts.isIdentifier(declaredName)) {
    return unsupportedIn("A namespace name must be a single identifier");
  }
  if (body === undefined || !ts.isModuleBlock(body)) {
    return unsupportedIn(`\`namespace ${declaredName.text}\` must have a body`);
  }
  const fields: JsIrRuntimeObjectField[] = [];
  for (const statement of body.statements) {
    if (isNonExecutableDeclaration(statement)) {
      continue;
    }
    const field = lowerNamespaceField(context, statement, bindings);
    if (field.kind !== "lowered") {
      return field;
    }
    fields.push(field.operation);
  }
  return produced({ fields });
}

/** One exported namespace member, as the field it contributes to the namespace object. */
function lowerNamespaceField(
  context: LoweringContext,
  statement: ts.Statement,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Produced<JsIrRuntimeObjectField> {
  if (ts.isModuleDeclaration(statement)) {
    // A nested namespace is an object *inside* the field, and a runtime object's field takes a value
    // expression rather than a nested object. The inline form belongs to the fixed-shape object, which
    // cannot hold a function member, so the two shapes do not combine yet.
    return unsupportedIn("Nested namespaces are not supported yet; a namespace member must be a value or a function");
  }
  const exported = ts.canHaveModifiers(statement) ? ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true : false;
  if (!exported) {
    // The closure that would keep a non-exported declaration local is the IIFE half of the desugaring
    // this does not perform, so a namespace carrying one is declined rather than given an object that
    // would be missing it at runtime.
    return unsupportedIn("A namespace declaration that is not `export`ed is not supported yet");
  }
  if (ts.isFunctionDeclaration(statement)) {
    const { name } = statement;
    if (name === undefined || !ts.isIdentifier(name)) {
      return unsupportedIn("An exported namespace function must be named");
    }
    const value = context.lowerObjectMethodFunctionValue(context, statement, bindings);
    if (value.kind !== "lowered") {
      return withRefusal(value, unsupportedIn(`\`function ${name.text}\` is not a function value this build can lower`));
    }
    return produced({ kind: "field", key: { kind: "literal", value: name.text }, value: value.operation });
  }
  if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) {
    return unsupportedIn("An exported namespace member must be a single `const`, `let`, `var` or `function` declaration");
  }
  const [declaration] = statement.declarationList.declarations;
  const declaredName = declaration.name;
  if (!ts.isIdentifier(declaredName) || declaration.initializer === undefined) {
    return unsupportedIn("An exported namespace variable must be a single named declaration with an initializer");
  }
  const value = context.lowerValueExpression(context, declaration.initializer, bindings);
  if (value.kind !== "lowered") {
    return withRefusal(value, unsupportedIn(`\`${declaredName.text}\` is not a value this build can evaluate`));
  }
  return produced({ kind: "field", key: { kind: "literal", value: declaredName.text }, value: value.operation });
}

/**
 * `namespace N { .. }` as the object-literal statement that binds `N`.
 *
 * The name is bound by the same operation an object literal's own name is bound by, so `N.member`
 * resolves through exactly the binding it would for the equivalent literal.
 */
export function lowerNamespaceDeclarationStatement(
  context: LoweringContext,
  statement: ts.ModuleDeclaration,
  bindings: ReadonlyMap<string, JsIrBindingValue>
): Lowered {
  const value = lowerNamespaceValue(context, statement, bindings);
  if (value.kind !== "lowered") {
    return unsupportedIn(value.reason);
  }
  const { name } = statement;
  if (!ts.isIdentifier(name)) {
    return unsupportedIn("A namespace name must be a single identifier");
  }
  return loweredOperation({ kind: "runtimeObjectLiteral", name: name.text, value: value.operation });
}
