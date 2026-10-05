declare function print(value: unknown): void;

// A class type parameter is erased: it constrains the annotations on members, and nothing about the
// emitted class mentions it.
class Box<T> {
  v: T;

  constructor(v: T) {
    this.v = v;
  }
}

print(new Box<number>(7).v);

// Type arguments on a heritage clause, which the `extends` clause resolves by base name alone.
class Base<T> {
  seed: number = 2;
}

class Derived<T> extends Base<T> {
  w: number = 3;
}

print(new Derived<number>().w);

// A static member on a generic class: the parameter has no instance type to constrain.
class WithStatic<T> {
  static make(): number {
    return 5;
  }
}

print(WithStatic.make());

// A generic class `implementing` an interface, which is erasure on top of erasure.
interface Shaped {
  v: number;
}

class Impl<T> implements Shaped {
  v: number = 4;
}

print(new Impl<number>().v);
