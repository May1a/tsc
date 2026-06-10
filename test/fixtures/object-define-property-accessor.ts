const obj: { x?: unknown } = {};
Object.defineProperty(obj, "x", { get() { return 1; } });
