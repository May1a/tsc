declare function print(value: unknown): void;

class A {
  readonly x: number = 1;
}
print(new A().x);
