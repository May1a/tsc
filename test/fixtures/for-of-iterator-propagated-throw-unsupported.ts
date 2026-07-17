declare function print(value: unknown): void;

function fail(): void {
  throw "failure";
}

const iterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: 1, done: false };
      }
    };
  }
};

for (const value of iterable) {
  print(value);
  fail();
}
