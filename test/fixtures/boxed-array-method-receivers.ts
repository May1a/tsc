declare function print(value: unknown): void;

// A method call on a boxed value that holds an array reads the method off the array, so a loop item,
// an `any` parameter and a reassigned `let` all reach Array.prototype.
for (const row of [[1, 2], [3]]) {
  print(row.join("-"));
}

function describe(value: any): string {
  return value.join(":");
}
print(describe(["a", "b"] as any));

let numbers: number[] | null = null;
numbers = [1, 2, 3];
print(numbers.length);
print(numbers.join("/"));
numbers.push(9);
print(numbers.includes(9));
