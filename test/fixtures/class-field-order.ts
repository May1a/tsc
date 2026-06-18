declare function print(value: unknown): void;

class C {
  first = "a";
  second = this.first + "b";
}

print(new C().second);
