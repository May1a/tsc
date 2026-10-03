declare function print(value: unknown): void;

// `Number.NaN` and `Number.POSITIVE_INFINITY` are not lowered, so the finite check uses literals.
print(Number.isFinite(7));
print(Number.isFinite(1.5));
