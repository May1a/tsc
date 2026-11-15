declare function print(value: unknown): void;

function check(...args: any[]): void {
  print(args.length);
}

// `eval` is declared by the ambient library, so the frontend accepts it, but lowering has no value
// for it: the call is refused at its argument, not at its target.
check(eval);
