declare function print(value: unknown): void;

const left: unknown[] = ["a", undefined, "c"];
const right: unknown[] = ["d"];
const combined: unknown[] = left.concat(right, "tail");

print(combined.length);
print(combined[0]);
print(combined[1]);
print(combined[2]);
print(combined[3]);
print(combined[4]);
