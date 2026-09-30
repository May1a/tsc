declare function print(value: unknown): void;

const source: unknown[] = [1, 2, 3];
const copy: unknown[] = Array.from(source);
print(copy.length);
print(copy[0]);

const mapped: unknown[] = Array.from([1, 2], (value) => Number(value) * 2);
print(mapped[0]);
print(mapped[1]);
