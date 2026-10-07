declare function print(value: unknown): void;

function f(this: void, x: number): number {
  return x;
}
print(f(2));
