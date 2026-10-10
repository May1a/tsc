const errorConstructors: readonly string[] = ["Error", "TypeError", "RangeError", "EvalError", "URIError", "SyntaxError"];

export function errorClassId(name: string): number {
  return errorConstructors.indexOf(name) + 1;
}
