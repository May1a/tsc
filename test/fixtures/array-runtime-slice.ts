declare function print(value: unknown): void;

const arr: unknown[] = ["a", , "c", "d"];
const copy: unknown[] = arr.slice(1, 4);
print(copy.length);
print(copy[0]);
print(copy[1]);
print(copy[2]);
