declare function print(value: unknown): void;

function f({ a }: any): void {
  print(a[0]);
  print(a[1]);
}

f({ a: [1, 2] });
