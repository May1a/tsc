declare function print(value: unknown): void;

function f(...args: any[]): void {
  print(args.length);
}

f();
f(1);
f(1, 2, 3);
