declare function print(value: unknown): void;

try {
  throw new Error("boom");
} catch (e: any) {
  print(e.message);
  try {
    throw e;
  } catch (f: any) {
    print(f.name);
    print(f.toString());
  }
}
