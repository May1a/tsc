declare function print(value: unknown): void;

const arr: unknown[] = ["a", , undefined, "c"];
print(arr.includes("a"));
print(arr.includes(undefined));
print(arr.indexOf("c"));
print(arr.indexOf("missing"));
