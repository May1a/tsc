declare function print(value: unknown): void;

try {
  throw "err";
} catch (e) {
  print(e);
} finally {
  print("finally");
}
