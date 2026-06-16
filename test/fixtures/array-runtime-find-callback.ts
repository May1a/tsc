declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3];
const missing: unknown[] = [4, 5];

function isTwo(value: unknown): number {
  return Number(value) === 2 ? 1 : 0;
}

const found = arr.find(isTwo);
const notFound = missing.find(isTwo);
print(found);
print(notFound);
