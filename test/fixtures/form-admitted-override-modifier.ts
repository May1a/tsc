declare function print(value: unknown): void;

class B {
  m(): number {
    return 1;
  }
}
class A extends B {
  override m(): number {
    return super.m() + 1;
  }
}
print(new A().m());
