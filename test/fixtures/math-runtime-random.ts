declare function print(value: unknown): void;

// Each call site is given a fixed value at compile time, so two runs of one program produce
// the same sequence. `Math.random()` is `"stubbed"` in the support manifest for that reason.
print(Math.random() === Math.random());