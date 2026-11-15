declare function print(value: unknown): void;
let n = 0;
function f({ x = ++n }: { x?: number }, y = ++n) {
  print(x);
  print(y);
}
f({});
