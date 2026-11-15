declare function print(value: unknown): void;

// An expression statement runs its expression for its effects: a read through null throws.
function expectThrow(callback: () => void) {
  try {
    callback();
    print("no throw");
  } catch (thrown: any) {
    print(thrown.name);
  }
}
const o: any = { a: 1 };
let n = 0;
o.a;
n;
function read(value: any) { value.missing; }
expectThrow(() => read(null));
expectThrow(() => read({}));
print("done");
