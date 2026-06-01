declare function print(value: unknown): void;

const obj = { x() { return 1; } };
print(obj.x);
