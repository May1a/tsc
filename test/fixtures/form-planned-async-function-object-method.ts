declare function print(value: unknown): void;

const o = { async m(): Promise<number> { return 1; } };
print(o.m());
