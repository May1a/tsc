declare function print(value: unknown): void;

const x: any = 42;
try {
  print("a" in x);
} catch (error) {
  print(error instanceof TypeError);
}
print("a" in { a: 1 });
print("size" in new Map());
