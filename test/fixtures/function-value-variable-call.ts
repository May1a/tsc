declare function print(value: unknown): void;

function add(left: number, right: number): number {
  return left + right;
}

const fn = add;
print(fn(2, 3));
