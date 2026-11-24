declare function print(value: unknown): void;

const key = Symbol("k");
const obj: { a?: unknown; [key: symbol]: unknown } = { a: 1 };
print(Object.getOwnPropertySymbols(obj).length);
obj[key] = 2;
print(Object.getOwnPropertySymbols(obj).length);
print(Object.getOwnPropertySymbols(obj)[0] === key);
