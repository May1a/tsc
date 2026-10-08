declare function print(value: unknown): void;

const array = Array.of(1, 2);
const iterator = array.values();
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
shadowed["values"] = 5;
print(shadowed["values"]);
try {
  const invalid = shadowed.values();
  print(invalid);
} catch (error) {
  print(error instanceof TypeError);
}
shadowed["values"] = function replacement() {
  print("own values");
  return {
    next() {
      return { value: 42, done: false };
    }
  };
};
const overridden = shadowed.values();
const overriddenResult = overridden.next();
print(overriddenResult.value);
