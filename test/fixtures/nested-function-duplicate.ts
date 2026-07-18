declare function print(value: unknown): void;

function first(): unknown {
  function sameName(): unknown {
    return 1;
  }
  return sameName();
}

function second(): unknown {
  function sameName(): unknown {
    return 2;
  }
  return sameName();
}

print(first());
print(second());
