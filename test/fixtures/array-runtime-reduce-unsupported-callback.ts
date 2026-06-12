declare function print(value: unknown): void;
const arr: unknown[] = [1, 2];
print(arr.reduce((left, right) => left));
