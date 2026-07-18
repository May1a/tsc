declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: 1, done: false };
      },
      return() {
        print("close");
        return { value: undefined, done: true };
      }
    };
  }
};

try {
  for (const value of iterable) {
    print(value);
    throw "boom";
  }
} catch (error) {
  print(error);
}
