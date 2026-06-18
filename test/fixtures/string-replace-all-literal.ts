declare function print(value: unknown): void;

let value = "one two one";
print(value.replaceAll("one", "1"));
