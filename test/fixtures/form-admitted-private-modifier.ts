declare function print(value: unknown): void;

class A {
  private x: number = 1;
  get(): number {
    return this.x;
  }
}
print(new A().get());
