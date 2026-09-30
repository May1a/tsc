declare function print(value: unknown): void;

const obj: { a?: unknown } = {};
obj.a = 1;
const symbols: symbol[] = Object.getOwnPropertySymbols(obj);
print(symbols.length);
