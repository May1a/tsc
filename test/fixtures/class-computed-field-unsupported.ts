declare function print(value: unknown): void;

const key = "x";
class C {
  [key] = 1;
}

print(new C().x);
