declare function print(value: unknown): void;

function f([first, second]: any[]): void {
  print(first);
  print(second);
}

f([10, 20]);
f([100, 200]);
