declare function print(value: unknown): void;

class A {
  accessor x = 1;
}
print(new A().x);
