declare function print(value: unknown): void;

const arr = ["a", "b"];
print(arr?.[0]);

const missing: unknown = undefined;
print((missing as any)?.[1]);

const dict = { key: "v" };
print(dict?.["key"]);
