declare function print(value: unknown): void;

function describe(x: number): void {
  if (x > 0) {
    print("positive");
    return;
  }
  print("not positive");
}

function noop(): undefined {
  return;
}

describe(1);
describe(-1);
print(noop());
