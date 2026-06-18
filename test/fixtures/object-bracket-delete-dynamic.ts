declare function print(value: unknown): void;

const obj: { [key: string]: unknown } = { a: "1", b: "2" };
const k = "a";
delete obj[k];
print(obj.a);
print(obj.b);
