declare function print(value: unknown): void;

const iterable: any = {
  [Symbol.iterator]() {
    return { next: 1 };
  }
};

try {
  for (const value of iterable) {
    print(value);
  }
} catch (error: any) {
  print(error.name);
  print(error.message);
}
