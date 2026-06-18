declare function print(value: unknown): void;

let value = "7";
print(value.padStart(3, "0"));
print(value.padStart(2, "ab"));
