declare function print(value: unknown): void;

print(new Date(0).toISOString());
print(new Date(1709210096789).toISOString());
try {
  new Date(NaN).toISOString();
  print("no-throw");
} catch (error) {
  print(error instanceof RangeError);
}
