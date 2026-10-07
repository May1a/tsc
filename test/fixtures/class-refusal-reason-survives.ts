declare function print(value: unknown): void;

// `extends` names a class this module has not lowered yet, because `B` is declared after `A`. The class
// tier refuses with a reason, and the reason has to survive the trip to the diagnostic — it used to get
// there by throwing, and the throw unwound the whole file.
class A extends B {
  m(): number {
    return 1;
  }
}

class B {
  m(): number {
    return 2;
  }
}

print(new A().m());
