declare function print(value: unknown): void;

const arr: unknown[] = [2, 4, 6];

function visit(value: unknown, index: number): void {
  print(Number(value) + index);
}

arr.forEach(visit);
print("done");
