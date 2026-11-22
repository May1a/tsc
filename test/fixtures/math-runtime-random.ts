declare function print(value: unknown): void;

const a = Math.random();
const b = Math.random();
print(a >= 0 && a < 1);
print(b >= 0 && b < 1);
print(a !== b);
