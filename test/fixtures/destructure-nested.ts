declare function print(value: unknown): void;

const obj = { a: { b: "deep" }, top: "t" };
const { a: { b }, top } = obj;
print(b);
print(top);
