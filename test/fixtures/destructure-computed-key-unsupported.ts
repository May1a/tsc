declare function print(value: unknown): void;

const k = "x";
const obj = { x: "v" };
const { [k]: v } = obj;
print(v);
