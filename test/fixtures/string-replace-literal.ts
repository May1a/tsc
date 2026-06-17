declare function print(value: unknown): void;

let value = "one two one";
print(value.replace("one", "1"));
print(value.replace("missing", "x"));
