declare function print(value: unknown): void;
function fail(): number { throw "binding failed"; }
const iterable = {
  [Symbol.iterator]() {
    return {
      next(): IteratorResult<number[]> { return { value: [], done: false }; },
      return(): IteratorResult<number[]> { print("closed"); return { value: [], done: true }; }
    };
  }
};
try {
  for (const [value = fail()] of iterable) { print(value); }
} catch (error) { print(error); }
const pairs = [[1, 2], [3, 4]];
for (const [a, b] of pairs) { print(a); print(b); break; }

function failNested(): number[] { throw "nested binding failed"; }
const nestedIterable = {
  [Symbol.iterator]() {
    return {
      next(): IteratorResult<number[][]> { return { value: [], done: false }; },
      return(): IteratorResult<number[][]> { print("nested closed"); return { value: [], done: true }; }
    };
  }
};
try {
  for (const [[value] = failNested()] of nestedIterable) { print(value); }
} catch (error) { print(error); }
