declare function print(value: unknown): void;

function f(a: number, b: number = 20, c: number = 30) {
  print(a + b + c);
}
f(1);
f(1, 2);
f(1, 2, 3);
