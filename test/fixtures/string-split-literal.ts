declare function print(value: unknown): void;

let value = "a,b,c";
const parts: unknown[] = value.split(",");
print(parts.length);
print(parts[0]);
print(parts[1]);
print(parts[2]);
