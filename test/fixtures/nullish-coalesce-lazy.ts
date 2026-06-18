declare function print(value: unknown): void;

function fallback(): string {
  print("evaluated");
  return "fb";
}

const present: unknown = "value";
print(present ?? fallback());

const missing: unknown = undefined;
print(missing ?? fallback());
