declare function print(value: unknown): void;

try {
  try {
    print("try");
  } finally {
    print("inner");
  }
} finally {
  print("outer");
}
