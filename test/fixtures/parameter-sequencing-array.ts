declare function print(value: unknown): void;
let n = 0;
function consume([x = ++n]: number[], y = ++n, ...rest: number[]) {
  print(x);
  print(y);
  print(rest.length);
}
consume([]);
consume([7], undefined, 8, 9);
function reference([x]: number[], y = x) { print(y); }
reference([12]);
