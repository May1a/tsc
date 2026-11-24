declare function print(value: unknown): void;

function outer(): void {
  function read(): number { return x; }
  try {
    print(read());
  } catch (error) {
    print(error instanceof ReferenceError);
  }
  const x = 1;
  print(read());
}
outer();
