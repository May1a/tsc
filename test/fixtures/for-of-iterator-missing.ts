declare function print(value: unknown): void;

const iterable = {};
try {
  for (const value of iterable as any) {
    print(value);
  }
  print("unreachable");
} catch (error: any) {
  print(error.name);
  print(error.message);
}
