declare function print(value: unknown): void;

const missingFn: unknown = undefined;
print((missingFn as any)?.());

const e = new Error("boom");
print(e.toString?.());
