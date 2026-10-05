declare function print(value: unknown): void;

// `constructor(readonly v: T)` declares a field from the parameter rather than in the body. The class
// tier recognises the shape and refuses it by name.
class Box {
  constructor(readonly v: number) {}
}

print(new Box(7).v);
