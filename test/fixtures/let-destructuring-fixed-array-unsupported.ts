declare function print(value: unknown): void;

// A fixed-layout array has no boxed value for a `let` pattern to read yet (PLAN.md 2c).
const xs = [1, 2];
let [a, b] = xs;
print(a + b);
