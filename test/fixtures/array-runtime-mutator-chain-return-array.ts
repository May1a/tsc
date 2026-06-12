declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c"];
const reversed: unknown[] = arr.reverse();
const filled: unknown[] = arr.fill("x", 1);
const copied: unknown[] = arr.copyWithin(1, 0);

print(reversed[0]);
print(filled[1]);
print(copied[2]);
print(arr[2]);
