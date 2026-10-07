declare function print(value: unknown): void;

// `implements` is erased: it asserts a shape the class already has and produces no runtime base. The
// method that satisfies it is lowered normally, which is the whole observable effect.
interface Greeter {
  greet(): string;
}

class En implements Greeter {
  greet(): string {
    return "hi";
  }
}

print(new En().greet());

// `implements` alongside `extends`, in the order TypeScript allows: `extends` first. The base is still
// the only thing that contributes a runtime prototype, so the inherited method has to survive.
interface Tally {
  total(): number;
}

class Base {
  protected seed: number = 2;
}

class Counted extends Base implements Tally {
  total(): number {
    return this.seed + 1;
  }
}

print(new Counted().total());
