declare function print(value: unknown): void;
const result = Array.of<unknown>("a", 1, true);
print(result.length);
print(result[0]);
print(result[1]);
print(result[2]);
