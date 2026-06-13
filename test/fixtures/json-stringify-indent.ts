declare function print(value: unknown): void;

const obj = { a: 1, c: { d: "v" } };
print(JSON.stringify(obj, null, 2));

const list: unknown[] = [1, "x"];
print(JSON.stringify(list, null, 2));
