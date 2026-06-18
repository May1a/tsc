declare function print(value: unknown): void;

function f(first: number, ...rest: any[]): void {
  print(first);
  print(rest.length);
}

f(10, 20, 30);
