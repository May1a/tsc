declare function print(value: unknown): void;

const arr: unknown[] = [1, 2];
const result = arr.reduce(function (this: unknown, left, right) {
  print(this === undefined);
  return Number(left) + Number(right);
}, 10);

print(result);
