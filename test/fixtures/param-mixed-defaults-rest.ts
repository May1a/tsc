declare function print(value: unknown): void;

function f(a: number, b: number = 5, ...rest: any[]): void {
  print(a + b + rest.length);
}

f(1);
f(1, 2);
f(1, 2, 3, 4);
