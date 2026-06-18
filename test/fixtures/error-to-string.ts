declare function print(value: unknown): void;

const e = new Error("boom");
print(e.toString());
