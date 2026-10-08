declare function print(value: unknown): void;

const array = Array.of(1, 2);
const iterator = array.keys();
const first = iterator.next();
const second = iterator.next();
const third = iterator.next();
const fourth = iterator.next();
print(first.value);
print(first.done);
print(second.value);
print(second.done);
print(third.value);
print(third.done);
print(fourth.done);

// Deliberately replace a typed builtin with a non-callable JavaScript value.
const shadowed: any = Array.of(1, 2);
shadowed["keys"] = 5;
print(shadowed["keys"]);
try {
  const invalid = shadowed.keys();
  print(invalid);
} catch (error) {
  print(error instanceof TypeError);
}
shadowed["keys"] = function replacement() {
  print("own keys");
  return {
    next() {
      return { value: 42, done: false };
    }
  };
};
const overridden = shadowed.keys();
const overriddenResult = overridden.next();
print(overriddenResult.value);

// An own undefined value still shadows the builtin. Deleting it restores lookup.
shadowed["keys"] = undefined;
print(shadowed["keys"]);
try {
  const invalid = shadowed.keys();
  print(invalid);
} catch (error) {
  print(error instanceof TypeError);
}
delete shadowed["keys"];
const restored = shadowed.keys();
const restoredResult = restored.next();
print(restoredResult.done);
