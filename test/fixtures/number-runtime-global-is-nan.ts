declare function print(value: unknown): void;

// `0 / 0` is how a NaN reaches the lowered tier; `Number.NaN` itself is not lowered.
const nan: number = 0 / 0;
print(isNaN(7));
print(isNaN(nan));
