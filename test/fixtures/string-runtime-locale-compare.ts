declare function print(value: unknown): void;

const a: string = "apple";
const b: string = "banana";
print(a.localeCompare(b) < 0);
print(b.localeCompare(a) > 0);
print(a.localeCompare("apple") === 0);
