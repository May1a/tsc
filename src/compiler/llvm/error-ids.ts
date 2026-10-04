/**
 * The class id the runtime uses for `instanceof`.
 *
 * `errorNew` takes the id as an integer and the order here *is* the numbering, so the array is not a
 * list to sort or search — it is the definition. `Error` is 0, which is also the fallback for a name
 * that is not in the table, so an unrecognised error name becomes a plain `Error` rather than
 * something that fails to lower.
 *
 * It is its own module because two unrelated tiers need it and neither owns it: the condition tier,
 * to answer `e instanceof TypeError`, and error construction, to build one. The plan's step 6 lists
 * `Error` as one of the twelve builtin owners, and this is the only piece of that owner's knowledge
 * the emitter needs.
 */
export const errorConstructorOrder = [
  "Error",
  "TypeError",
  "RangeError",
  "EvalError",
  "URIError",
  "SyntaxError"
] as const;

export const errorClassIds = new Map<string, number>(
  errorConstructorOrder.map((name, index) => [name, index + 1])
);
