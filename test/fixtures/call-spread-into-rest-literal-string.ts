declare function print(value: unknown): void;

function f(...args: string[]): void {
  print(args.length);
  print(args[0]);
}

f(...["a"]);
