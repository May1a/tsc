declare function print(value: unknown): void;

// A `declare` declaration states a type the compiler checks against and emits nothing, so the name it
// introduces exists only in the type world. What the fixture can show is that lowering one contributes
// no operation and leaves no binding behind for the shapes that do exist at runtime.

// The ambient class is used as a type only. `implements` is itself erased, so the clause resolves to
// nothing at runtime and the concrete class below is emitted on its own.
declare class Shape {
  area(): number;
}

class Square implements Shape {
  side: number = 2;

  area(): number {
    return this.side * this.side;
  }
}

print(new Square().area());

// An ambient function is never callable, so the fixture never calls it: a call would be a
// ReferenceError in Node. The function that runs is the one with a body.
declare function ambient(value: number): string;

function ambientImpl(value: number): string {
  return `v${value}`;
}

print(ambientImpl(7));

// The declared `config` is never read, because reading it would throw. The class field of the same
// shape is what carries a value, which is the observable difference between the two declarations.
declare const config: { label: string };

class Labelled {
  label: string = "live";
}

print(new Labelled().label);
