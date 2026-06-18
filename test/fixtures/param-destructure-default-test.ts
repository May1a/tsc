declare function print(value: unknown): void;

function f({ a, b = 10 }: any): void {
  print(a);
  print(b);
}

f({ a: 1 });
f({ a: 1, b: 2 });
