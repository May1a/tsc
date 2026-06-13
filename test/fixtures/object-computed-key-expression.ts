declare function print(value: unknown): void;

const key1 = "alpha";
const key2 = "beta";
const obj = { [key1]: "v1", [key2 + "x"]: "v2", gamma: "v3" };
print(obj.alpha);
print(obj.betax);
print(obj.gamma);
