declare function print(value: unknown): void;

// The frames differ between engines, so only the part ECMAScript programs rely on is compared.
const e = new Error("boom");
const stack = String(e.stack);
print(typeof e.stack);
print(stack.startsWith("Error: boom"));
