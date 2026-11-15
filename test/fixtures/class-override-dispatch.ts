declare function print(value: unknown): void;

// A three-level chain: B inherits `area` from A, and C overrides it. `kind` is abstract in A, with
// concrete overrides in B and C. `double` dispatches through `this`. `plain` is never overridden, so
// calls to it stay direct.
abstract class A {
  abstract kind(): string;

  area(): number {
    return 1;
  }

  double(): number {
    return this.area() * 2;
  }

  plain(): number {
    return 7;
  }
}

class B extends A {
  kind(): string {
    return "b";
  }
}

class C extends B {
  kind(): string {
    return "c";
  }

  area(): number {
    return super.area() + 3;
  }
}

// A `const` initialized with `new C()` holds exactly a C, so these stay direct calls.
const direct: A = new C();
print(direct.area());
print(direct.kind());
print(new B().area());

// A base-typed receiver that may hold any subclass dispatches through the prototype chain.
const mixed: A[] = [new B(), new C(), new B()];
const first: A = mixed[0];
print(first.area());
print(first.kind());
print(first.double());
print(first.plain());

for (const item of mixed) {
  print(item.area());
  print(item.kind());
  print(item.double());
  print(item.plain());
}

print(new C().double());
