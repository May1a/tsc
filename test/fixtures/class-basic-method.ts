declare function print(value: unknown): void;

class Box {
  value() {
    return 42;
  }
}

print(new Box().value());
