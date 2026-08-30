declare function print(value: unknown): void;

class Box {
  value(): number {
    return 42;
  }
}

const box = new Box();
box.value();
print("ok");
