declare function print(value: unknown): void;

class C {
  x = 3;
}

print(new C().x);
