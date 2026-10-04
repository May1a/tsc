declare function print(value: unknown): void;

class Box<T> {
  constructor(readonly v: T) {}
}
print(new Box<number>(7).v);
