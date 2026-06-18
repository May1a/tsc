declare function print(value: unknown): void;

const target: { x: number; y?: number } = { x: 1 };
const source = { y: 2 };
Object.assign(target, source);
print(target.x);
print(target.y);
