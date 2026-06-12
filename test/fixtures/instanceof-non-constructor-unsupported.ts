declare function print(value: unknown): void;

const notAConstructor = { name: "x" };
const e = new Error("boom");
print(e instanceof (notAConstructor as any));
