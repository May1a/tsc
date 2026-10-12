// Class ids index the runtime's `@errorConstructorTable`, so this order is part of its contract.
const errorConstructors: readonly string[] = ["Error", "TypeError", "RangeError", "EvalError", "URIError", "SyntaxError", "ReferenceError"];

export function errorClassId(name: string): number {
  return errorConstructors.indexOf(name) + 1;
}
