declare function print(value: unknown): void;

function check(...args: any[]): void {
  print(args.length);
}

// `Math.max` is a function this build cannot read as a value: the refusal names the argument rather
// than the call around it.
check(Math.max);
