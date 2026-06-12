declare function print(value: unknown): void;

const obj: { x?: unknown } = {};
let flag = true;
Object.defineProperty(obj, "x", { value: 1, writable: flag });
const desc: any = Object.getOwnPropertyDescriptor(obj, "x");
print(desc.writable);
