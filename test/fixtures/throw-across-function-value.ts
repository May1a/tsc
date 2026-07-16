declare function print(value: unknown): void;

function fail(): void {
  throw "indirect";
}

const invoke = fail;

try {
  invoke();
  print("unreachable");
} catch (error) {
  print(error);
}
