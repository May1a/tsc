declare function print(value: unknown): void;

// `abstract` on a class erases: the class is emitted, because it still has a constructor and its
// concrete members are reachable at runtime.
abstract class Shape {
  abstract area(): number;

  describe(): string {
    return "shape";
  }
}

class Square extends Shape {
  side: number = 2;

  area(): number {
    return this.side * this.side;
  }
}

print(new Square().area());
print(new Square().describe());

// An abstract member is not on the prototype, so it is dropped per member and the concrete members
// around it are unaffected — two abstract declarations bracket one concrete one here.
abstract class Pair {
  abstract left(): number;

  concrete(): number {
    return 1;
  }

  abstract right(): number;
}

class Both extends Pair {
  left(): number {
    return 10;
  }

  right(): number {
    return 20;
  }
}

print(new Both().concrete());
print(new Both().left() + new Both().right());
