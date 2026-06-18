declare function print(value: unknown): void;

let value = "7";
print(value.padEnd(3, "0"));
print(value.padEnd(4, "ab"));
