declare function print(value: unknown): void;

// The calls below lower before `Square` is declared, so whether they dispatch cannot depend on the
// classes lowered so far. Base instances still reach the base implementation through the prototype.
class Shape {
  area(): number {
    return 1;
  }

  twice(): number {
    return this.area() * 2;
  }
}

function areaOf(shape: Shape): number {
  return shape.area();
}

function totalArea(shapes: Shape[]): number {
  let total = 0;
  for (const shape of shapes) {
    total += shape.area();
  }
  return total;
}

print(areaOf(new Shape()));
print(new Shape().twice());

class Square extends Shape {
  area(): number {
    return 4;
  }
}

print(areaOf(new Square()));
print(new Square().twice());
print(totalArea([new Square(), new Shape(), new Square()]));
