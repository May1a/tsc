declare function print(value: unknown): void;

const base = { x: 1 };
const obj = { ...base, y: 2 };
print(obj.y);
