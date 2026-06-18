declare function print(value: unknown): void;

const obj = { name: "x" };
print(obj?.name);

const missing: unknown = undefined;
print((missing as any)?.name);

const nul: unknown = null;
print((nul as any)?.name);
