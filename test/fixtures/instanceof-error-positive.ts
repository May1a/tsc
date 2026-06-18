declare function print(value: unknown): void;

const e = new Error("boom");
print(e instanceof Error);

try {
  throw new Error("caught");
} catch (err: any) {
  print(err instanceof Error);
}
