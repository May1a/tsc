declare function print(value: unknown): void;

const empty: unknown[] = [];
const filled: unknown[] = [undefined];
if (empty) {
  print("empty array");
}
if (filled) {
  print("filled array");
}
if (!empty) {
  print("wrong");
}
