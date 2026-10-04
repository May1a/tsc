interface I {
  m(): void;
}
class A implements I {
  m(): void {}
}
print(typeof A);
