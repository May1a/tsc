declare function print(value: unknown): void;

function f(a: number, ...rest: any[]): void {
  print(a);
  print(rest.length);
}

f(1);
