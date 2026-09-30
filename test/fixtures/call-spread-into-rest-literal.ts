declare function print(value: unknown): void;

function f(...args: number[]): void {
  print(args.length);
  print(args[0]);
  print(args[1]);
}

f(...[1, 2]);
