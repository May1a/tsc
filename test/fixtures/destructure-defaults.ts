declare function print(value: unknown): void;

const [a = 1, b = "hello"] = [];
print(a);
print(b);

const { x = 7 } = {};
print(x);

const sparse: unknown[] = ["set"];
const [kept = "fallback", missing = "used"] = sparse;
print(kept);
print(missing);
