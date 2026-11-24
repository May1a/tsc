declare function print(value: unknown): void;

function make(value: number): number {
  class Inner {
    m(): number {
      return value + 1;
    }
    clone(): Inner {
      return new Inner();
    }
  }
  return new Inner().clone().m();
}

print(make(1));
print(make(5));
