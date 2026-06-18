declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3, 4];

function isEven(value: unknown): number {
  return Number(value) === 2 || Number(value) === 4 ? 1 : 0;
}

const evens = arr.filter(isEven);
print(evens.length);
print(evens[0]);
print(evens[1]);
