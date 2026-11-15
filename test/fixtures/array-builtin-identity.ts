declare function print(value: unknown): void;

function inspect(a: any, b: any) {
  const f = a.map;
  const g = a.map;
  print(f === g);
  print(f === b.map);
  print(f === a.filter);
}
const first: any[] = [1, 2];
const second: any[] = [3];
inspect(first, second);
