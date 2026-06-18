declare function print(value: unknown): void;

function f([x, y]: any[]): void {
  print(x);
  print(y);
}

f([1, 2]);
