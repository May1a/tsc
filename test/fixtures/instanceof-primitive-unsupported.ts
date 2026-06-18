declare function print(value: unknown): void;

const n = 42;
print((n as any) instanceof Error);
