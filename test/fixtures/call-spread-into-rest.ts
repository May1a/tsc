declare function print(value: unknown): void;

function f(...args: any[]): void {
  print(args.length);
}

const a = [1, 2, 3];
f(...a);
