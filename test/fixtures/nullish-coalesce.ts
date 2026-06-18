declare function print(value: unknown): void;

const missing: unknown = undefined;
print(missing ?? "fallback");

const seven: unknown = 7;
print(seven ?? 1);

const zero: unknown = 0;
print(zero ?? 5);

const nul: unknown = null;
print(nul ?? "default");
