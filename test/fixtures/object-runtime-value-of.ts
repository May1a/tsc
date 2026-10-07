declare function print(value: unknown): void;

// `valueOf` is lowered for a boxed primitive, which is the one receiver the runtime can answer it
// for. On a plain object it is a known builtin this build has not written.
const boxed: { valueOf(): number } = new Number(42) as unknown as { valueOf(): number };
print(boxed.valueOf());
