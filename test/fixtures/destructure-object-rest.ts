declare function print(value: unknown): void;

const obj = { a: "1", b: "2", c: "3" };
const { a, ...rest } = obj;
print(a);

const keys = Object.keys(rest);
print(keys.length);
print(rest.b);
print(rest.c);
