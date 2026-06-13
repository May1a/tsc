declare function print(value: unknown): void;

const obj = { x: "val", other: "o" };
const { x: y, other: renamed } = obj;
print(y);
print(renamed);
