declare function print(value: unknown): void;

function f(first: number, ...rest: number[]): void {
  print(first);
  print(rest.length);
  print(rest[0]);
  print(rest[1]);
}

f(1, ...[2, 3]);
