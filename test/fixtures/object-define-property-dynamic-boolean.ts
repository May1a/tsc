const obj: { x?: unknown } = {};
let flag = true;
Object.defineProperty(obj, "x", { value: 1, writable: flag });
