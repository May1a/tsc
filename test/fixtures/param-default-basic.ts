declare function print(value: unknown): void;

function add(a: number, b: number = 10) {
  print(a + b);
}
add(1);
add(3, 4);
