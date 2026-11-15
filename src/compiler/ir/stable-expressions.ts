/**
 * Whether a `const` initializer may stand in for the binding at every read.
 *
 * The binding map records a `const` by the expression that initializes it, so a later read can fold
 * a literal or inline an operator chain. That is only sound when evaluating the expression again
 * yields the value the declaration stored. A read of a mutable binding, a call, an update, or an
 * element read can observe a later write or repeat a side effect: `let n = 1; const m = n * 10;
 * n = 2;` must leave `m` at 10, and `const a = ++i` must increment `i` once. Such a `const` is read
 * from the storage its declaration filled instead.
 *
 * The node kinds below are listed positively, so a new expression kind is read from storage until it
 * is shown to be stable here. A miss costs a load, never a wrong value.
 */
const stableKinds: ReadonlySet<string> = new Set([
  // Constants.
  "literal",
  "nan",
  "negatedZero",
  "boolean",
  "null",
  "undefined",
  // Reads of bindings lowering never reassigns: parameters, which refuse assignment, and the
  // aggregates an object or array literal declares, which a reference shares rather than copies.
  "parameter",
  "objectRef",
  "arrayRef",
  // Operators without effects, over operands that must themselves be stable.
  "unary",
  "binary",
  "ternary",
  "concat",
  "numberFormat",
  "typeof",
  "negate",
  "and",
  "or",
  "numberComparison",
  "stringComparison",
  "booleanComparison",
  "numberPredicate",
  // The value tier's wrappers around a number, string, or condition operand.
  "number",
  "string"
]);

export function isStableExpression(expression: object): boolean {
  if ("kind" in expression && (typeof expression.kind !== "string" || !stableKinds.has(expression.kind))) {
    return false;
  }
  return Object.values(expression).every((child: unknown) => {
    if (child === null || typeof child !== "object") {
      return true;
    }
    if (Array.isArray(child)) {
      return child.every((element: unknown) => element === null || typeof element !== "object" || isStableExpression(element));
    }
    return isStableExpression(child);
  });
}
