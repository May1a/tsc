declare function print(value: unknown): void;

const error = new Error("boom");
print(error.toString());
const typeError = new TypeError("bad");
print(typeError.toString());
