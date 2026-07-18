declare function print(value: unknown): void;

try {
  print("try");
} finally {
  print("finally");
}
