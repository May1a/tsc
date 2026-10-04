declare function print(value: unknown): void;

function f(): unknown {
  return new.target;
}
print(typeof f());
