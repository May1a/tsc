declare function print(value: unknown): void;

const arr: unknown[] = [1, 2];
const mapped = arr.flatMap((value) => [value, Number(value) + 10]);
print(mapped.length);
print(mapped[0]);
print(mapped[1]);
print(mapped[2]);
print(mapped[3]);
