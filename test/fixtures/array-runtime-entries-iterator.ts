declare function print(value: unknown): void;

const array = Array.of(1, 2);
const iterator = array.entries();
const first = iterator.next();
const firstPair = first.value;
const second = iterator.next();
const secondPair = second.value;
const third = iterator.next();
const fourth = iterator.next();
if (firstPair !== undefined && secondPair !== undefined) {
  print(firstPair[0]);
  print(firstPair[1]);
  print(first.done);
  print(secondPair[0]);
  print(secondPair[1]);
  print(second.done);
}
print(third.value);
print(third.done);
print(fourth.done);

// Deliberately replace a typed builtin with a non-callable JavaScript value.
const shadowed: any = Array.of(1, 2);
shadowed["entries"] = 5;
print(shadowed["entries"]);
try {
  const invalid = shadowed.entries();
  print(invalid);
} catch (error) {
  print(error instanceof TypeError);
}
shadowed["entries"] = function replacement() {
  print("own entries");
  return {
    next() {
      return { value: 42, done: false };
    }
  };
};
const overridden = shadowed.entries();
const overriddenResult = overridden.next();
print(overriddenResult.value);
