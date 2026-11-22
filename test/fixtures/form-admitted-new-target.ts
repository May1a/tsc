declare function print(value: unknown): void;

class Base {
  targetName: string;
  constructor() {
    this.targetName = new.target ? new.target.name : "none";
  }
}

class Derived extends Base {
  same: boolean;
  constructor() {
    super();
    this.same = new.target === Derived;
  }
}

function plain(): unknown {
  return new.target;
}

const b = new Base();
const d = new Derived();
print(b.targetName);
print(d.targetName);
print(d.same);
print(plain());
