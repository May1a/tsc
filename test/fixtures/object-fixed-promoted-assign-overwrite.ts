declare function print(value: unknown): void;

const target: { x: number; y?: number } = { x: 1 };
const first = { y: 2 };
const second = { x: 3 };

Object.assign(target, first, second);

print(target.x);
print(target.y);
