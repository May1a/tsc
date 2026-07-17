declare function print(value: unknown): void;

const iterable: any = {
  [Symbol.iterator]() {
    return {
      next() {
        throw "from-next";
      }
    };
  }
};

try {
  for (const value of iterable) {
    print(value);
  }
  print("unreachable");
} catch (error) {
  print(error);
}
