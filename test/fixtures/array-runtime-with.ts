declare function print(value: unknown): void;

const orig = [10, 20, 30];
const updated = orig.with(1, 99);
const neg = orig.with(-1, 77);
print(orig.join(","));
print(updated.join(","));
print(neg.join(","));
try {
  orig.with(5, 1);
  print("no-throw");
} catch (error) {
  print(error instanceof RangeError);
}
