declare function print(value: unknown): void;

const obj = { x: 1 };
obj["x"] = 99;
print(obj.x);
