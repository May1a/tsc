declare function print(value: unknown): void;

class A {
  public x: number = 1;
}
print(new A().x);
