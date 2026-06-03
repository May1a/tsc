declare function print(value: unknown): void;

const key = "x";
const obj = { x: 1 };
obj.x = 2;
print(obj[key]);
