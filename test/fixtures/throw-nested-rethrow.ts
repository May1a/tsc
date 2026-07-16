declare function print(value: unknown): void;

function fail(): void {
  throw "inner";
}

try {
  try {
    fail();
  } catch (error) {
    print(error);
    throw "outer";
  }
} catch (error) {
  print(error);
}
