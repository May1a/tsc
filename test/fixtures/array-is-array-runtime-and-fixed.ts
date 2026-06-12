declare function print(value: unknown): void;

const fixed = [1, 2];
const runtime: unknown[] = ["x"];
print(Array.isArray(fixed));
print(Array.isArray(runtime));
