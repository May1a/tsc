declare function print(value: unknown): void;

function fail(): unknown {
  print("default");
  throw "boom";
}

const iterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: undefined, done: false };
      },
      return() {
        print("close");
        return { value: undefined, done: true };
      }
    };
  }
};

try {
  const [value = fail()] = iterable;
  print(value);
} catch (error) {
  print(error);
}
