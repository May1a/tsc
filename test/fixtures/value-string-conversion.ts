declare function print(value: unknown): void;

const obj: { value?: unknown } = { value: "x" };
const arr: unknown[] = ["x"];

print(String(undefined));
print(String(null));
print(String(true));
print(String(false));
print(String(42));
print(String(obj));
print(String(arr));
