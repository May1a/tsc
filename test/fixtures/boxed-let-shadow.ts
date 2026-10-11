declare function print(value: unknown): void;

// The inner `x` widens to a boxed slot while the outer `x` keeps its number storage.
let x = 1;
{
  let x: any = "s";
  print(x);
  x = 2;
  print(x);
}
print(x);
