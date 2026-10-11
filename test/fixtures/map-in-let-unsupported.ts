declare function print(value: unknown): void;

// A `const` can hold a `Map`, but a `let` keeps the representation of its initializer, so the
// declaration names the storage limit rather than the declaration around it.
let m = new Map();
print(m);
