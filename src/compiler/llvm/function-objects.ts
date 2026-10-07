import type { JsIrFunctionParameter } from "../ir/bindings.js";

/**
 * How a function object is named, and how wide it is.
 *
 * Both answers are needed by the value tier — a call has to pass the right number of arguments to an
 * interned function, and a value has to name the global it was interned into — while the function tier
 * is what produces them. So they sit here, in a module with no dependencies, and both tiers read it.
 *
 * `internedFunctionGlobal` is an interning map keyed by identity, so two source functions that produce
 * the same closure share one global. That is the difference between a function object being comparable
 * and not, and it is why the map is keyed by the target rather than by the name.
 *
 * `functionObjectExpectedArgumentCount` is the *runtime* arity, not the declared one: a parameter with
 * a default reads as optional here, because the runtime pushes a value for every declared parameter and
 * substitutes the default when the argument is missing. Getting this wrong is an off-by-arity at every
 * call site rather than at one.
 */

export function internedFunctionGlobal(target: string): string {
  return `fnobj.singleton.${target}`.replace(/[^A-Za-z0-9_.]/g, "_");
}
// ExpectedArgumentCount: the number of leading parameters before the first
// one with a default initializer or a rest parameter.
export function functionObjectExpectedArgumentCount(parameters: readonly JsIrFunctionParameter[]): number {
  let count = 0;
  for (const parameter of parameters) {
    if (parameter.isRest === true || parameter.defaultValue !== undefined) {
      break;
    }
    count += 1;
  }
  return count;
}
