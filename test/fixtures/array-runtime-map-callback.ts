declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3];

function double(value: unknown): unknown {
  return Number(value) * 2;
}

const doubled = arr.map(double);
print(doubled.length);
print(doubled[0]);
print(doubled[1]);
print(doubled[2]);
