declare function print(value: unknown): void;

const numbers: unknown[] = [3, 1, 2];

// `sort` lowers in an initializer, with an optional comparator that must be a named binding taking
// the two comparison arguments. It is not recognized as a discarded statement.
function byValue(left: unknown, right: unknown): number {
  return Number(left) - Number(right);
}

const sorted: unknown[] = numbers.sort(byValue);
print(sorted[0]);
print(sorted[1]);
print(sorted[2]);

const ascending: unknown[] = numbers.sort();
print(ascending[0]);
