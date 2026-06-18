declare function print(value: unknown): void;

const left: unknown[] = ["a"];
const right: unknown[] = ["b", , "d"];
const combined: unknown[] = left.concat(right, "tail", 1, true);

print(combined.length);
print(combined[0]);
print(combined[1]);
print(combined[2]);
print(combined[3]);
print(combined[4]);
print(combined[5]);
