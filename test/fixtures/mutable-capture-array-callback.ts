declare function print(value: unknown): void;

let sum = 0;
const xs: unknown[] = [1, 2, 3];
xs.forEach((x) => {
  sum += Number(x);
});
print(sum);
