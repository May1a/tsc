declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    return {
      next() {
        if (true) {
          throw "boom";
        }
        return { value: undefined, done: true };
      },
      return() {
        print("close");
        return { value: undefined, done: true };
      }
    };
  }
};

try {
  const values = [...iterable];
  print(values.length);
} catch (error) {
  print(error);
}
