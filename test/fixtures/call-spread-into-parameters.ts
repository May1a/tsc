declare function print(value: unknown): void;

function f(a: number, b: number): void {
  print(a + b);
}

const a = [1, 2];
f(...a);
