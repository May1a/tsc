declare function print(value: unknown): void;

const key = "y";
const obj: Record<string, unknown> = { x: "old" };
obj[key] = "new";
print(obj[key]);
