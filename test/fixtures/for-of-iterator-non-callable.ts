declare function print(value: unknown): void;

const iterable: any = {};
iterable[Symbol.iterator] = 1;
try {
  for (const value of iterable) {
    print(value);
  }
  print("unreachable");
} catch (error: any) {
  print(error.name);
  print(error.message);
}
