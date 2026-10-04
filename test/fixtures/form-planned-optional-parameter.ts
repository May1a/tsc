declare function print(value: unknown): void;

function f(x?: number): number {
  return x ?? 0;
}
print(f());
print(f(3));
