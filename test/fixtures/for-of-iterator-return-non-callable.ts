declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: 1, done: false };
      },
      return: 5 as unknown as () => { value: undefined; done: boolean }
    };
  }
};

try {
  for (const value of iterable) {
    print(value);
    break;
  }
} catch (error: any) {
  print(error.name);
  print(error.message);
}
