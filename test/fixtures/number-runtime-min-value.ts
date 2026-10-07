declare function print(value: unknown): void;

const m: number = Number.MIN_VALUE;
print(m > 0);
print(m < 1e-300);