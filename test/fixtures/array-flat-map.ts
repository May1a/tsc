declare function print(value: unknown): void;
const values: unknown[] = [1, 2];
function expand(value: unknown): unknown {
  const pair: unknown[] = [value, value];
  return pair;
}
const result = values.flatMap(expand);
print(result.length);
print(result[0]);
print(result[1]);
print(result[2]);
print(result[3]);
