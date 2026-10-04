declare function print(value: unknown): void;

const error = new Error("boom");
print(error.message);
const empty = new Error();
print(empty.message);
