declare function print(value: unknown): void;
const error = new Error("message", { cause: "inner" });
print(error.message);
