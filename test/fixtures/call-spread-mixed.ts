declare function print(value: unknown): void;

function f(a: number, ...rest: any[]): void {
  print(a);
  print(rest.length);
}

const a = [2, 3, 4];
f(1, ...a);
