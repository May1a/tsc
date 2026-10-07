declare function print(value: unknown): void;

// An omitted optional parameter still occupies its slot, so the callee reads `undefined` rather than
// a neighbouring argument. `??` tests the slot at runtime, which is what makes that safe.
function omitted(x?: number): number {
  return x ?? -1;
}

print(omitted());
print(omitted(undefined));
print(omitted(5));

// Omission in the middle: the trailing argument must stay in its own slot rather than sliding left,
// which is the failure a "drop the missing one" encoding would produce.
function middle(a: number, b?: number, c?: number): string {
  return `${a}/${b}/${c}`;
}

print(middle(1));
print(middle(1, 2));
print(middle(1, 2, 3));

// A constructor parameter goes through the class path, which had its own refusal for `?`.
class Box {
  private v: number;

  constructor(start: number, bump?: number) {
    this.v = start + (bump ?? 1);
  }

  get(): number {
    return this.v;
  }
}

print(new Box(10).get());
print(new Box(10, 5).get());
