declare function print(value: unknown): void;

function fail(): void {
  throw "message";
}

try {
  fail();
  print("unreachable");
} catch (error) {
  print(error);
}

print("continued");
