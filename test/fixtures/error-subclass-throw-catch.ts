declare function print(value: unknown): void;

try {
  throw new TypeError("nope");
} catch (e: any) {
  print(e instanceof TypeError);
  print(e instanceof Error);
  print(e.message);
  print(e.toString());
}
