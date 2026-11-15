declare function print(value: unknown): void;

// A builtin error constructor is a value: one object per constructor, which every error of that
// class names as its `constructor`, and which creates an error when called.
function describe(constructor: any): string {
  return constructor.name;
}
print(describe(ReferenceError));

function thrownBy(expected: any, callback: () => void): boolean {
  try {
    callback();
  } catch (thrown: any) {
    return thrown.constructor === expected;
  }
  return false;
}
print(thrownBy(TypeError, () => { const value: any = null; value.x = 1; }));
print(thrownBy(RangeError, () => { throw new RangeError("range"); }));
print(thrownBy(TypeError, () => { throw new RangeError("range"); }));

const make: any = SyntaxError;
const made = make("called");
print(made.message);
print(String(made));
print(made.toString());
