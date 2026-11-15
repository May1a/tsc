declare function print(value: unknown): void;

// An options object with a `cause` gives the error an own, non-enumerable `cause`.
const error = new Error("message", { cause: "inner" });
print(error.message);
print(error.cause);
const keys = Object.keys(error);
print(keys.length);
const plain = new TypeError("no options");
print(plain.cause === undefined);
