declare function print(value: unknown): void;

function run(): number {
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
  for (const value of iterable) {
    print(value);
    return 99;
  }
  return 0;
}

print(run());
