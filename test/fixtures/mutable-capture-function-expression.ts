declare function print(value: unknown): void;

let n = 0;
const inc = function () {
  n += 1;
  return n;
};
inc();
print(inc());
