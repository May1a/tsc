declare function print(value: unknown): void;

function check(...args: any[]): void {
  print(args.length);
}

// `ReferenceError` is declared by the ambient library, so the frontend accepts it, but lowering has
// no value for an error constructor: the call is refused at its argument, not at its target.
check(ReferenceError);
