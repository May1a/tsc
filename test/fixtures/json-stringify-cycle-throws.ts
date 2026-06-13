declare function print(value: unknown): void;

const obj: { [key: string]: unknown } = { a: "1" };
obj["self"] = obj;
print(JSON.stringify(obj));
