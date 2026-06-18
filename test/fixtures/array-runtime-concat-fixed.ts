declare function print(value: unknown): void;

const left: unknown[] = ["a"];
const fixed = [1, 2];
const combined: unknown[] = left.concat(fixed, "tail");
print(combined.length);
