declare function print(value: unknown): void;

const values: unknown[] = [1, 2];
function visit(value: unknown): void {
  print(value);
}

values.forEach(visit, { offset: 10 });
