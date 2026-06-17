declare function print(value: unknown): void;
const values: unknown[] = ["a", "b", "c"];
function join(accumulator: unknown, value: unknown): unknown {
  return String(accumulator) + String(value);
}
const result = values.reduceRight(join, "");
print(result);
