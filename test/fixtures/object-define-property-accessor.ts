declare function print(value: unknown): void;

const obj: { x?: unknown } = {};
Object.defineProperty(obj, "x", { get() { return 1; } });
print(obj.x);
