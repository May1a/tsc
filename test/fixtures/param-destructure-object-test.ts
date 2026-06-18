declare function print(value: unknown): void;

function f({ a, b }: any): void {
  print(a);
  print(b);
}

f({ a: 1, b: 2 });
