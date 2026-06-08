declare function print(value: unknown): void;

const obj: { value?: unknown; missing?: unknown } = { value: "old" };
delete obj.value;
delete obj.missing;
print(obj.value);
print(obj.missing);
