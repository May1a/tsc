declare function print(value: unknown): void;

const m: number = Number.MAX_SAFE_INTEGER;
print(m === 9007199254740991);