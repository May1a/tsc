declare function print(value: unknown): void;

function outer(n: unknown): unknown {
  function identity(x: unknown): unknown {
    return x;
  }
  return identity(n);
}

print(outer(7));
