declare function print(value: unknown): void;

const left: unknown = "hello";
const right: unknown = "he" + "llo";
const other: unknown = "world";

print(left === right);
print(left === "hello");
print(left !== other);
