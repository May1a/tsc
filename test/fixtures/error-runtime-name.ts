declare function print(value: unknown): void;

const error = new Error("boom");
print(error.name);
const typeError = new TypeError("bad");
print(typeError.name);
