declare function print(value: unknown): void;

const obj = { ["ab"]: "v1", ["k" + "ey"]: "v2" };
print(obj.ab);
print(obj.key);
