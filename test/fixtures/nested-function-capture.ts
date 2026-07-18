declare function print(value: unknown): void;

const value = 100;

function outer(value: number): unknown {
  function captured(): unknown {
    if (true) {
      const value = "shadowed";
      print(value);
    }
    return value;
  }
  function defaultCaptured(input: number = value): number {
    return input;
  }
  function destructuredCaptured([input = value]: unknown[]): unknown {
    return input;
  }
  defaultCaptured();
  destructuredCaptured([]);
  return captured();
}

print(outer(42));
