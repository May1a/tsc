declare function print(value: unknown): void;

// A `const` holds a `Map` in collection storage, which a `let` cannot use yet, so the refusal names
// the initializer rather than the declaration around it.
let m = new Map();
print(m);
