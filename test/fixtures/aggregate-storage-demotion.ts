declare function print(value: unknown): void;

// Fixed array promoted on method calls.
const a = [3, 1, 2];
print(a.join(","));
a.sort();
print(a.join("-"));

// Fixed array promoted when passed to a function.
function sumArr(xs: number[]): number {
  let total = 0;
  for (const x of xs) {
    total += x;
  }
  return total;
}
const nums = [4, 5, 6];
print(sumArr(nums));

// Fixed array promoted when destructured by let.
const pair = [10, 20];
let [p0, p1] = pair;
p0 += 1;
print(p0 + p1);

// Local fixed array promoted when captured by a nested closure.
function makeReader() {
  const local = [7, 8, 9];
  return () => local[1];
}
print(makeReader()());

// Fixed object promoted on dynamic key read/write.
const counts: Record<string, number> = { a: 1 };
const key = "b";
counts[key] = (counts[key] ?? 0) + 2;
counts["a"] = (counts["a"] ?? 0) + 3;
print(counts["a"]);
print(counts["b"]);

// Fixed object promoted on let destructuring and escaping to a function.
const point = { x: 3, y: 4 };
let { x, y } = point;
x *= 10;
print(x + y);
function readX(o: { x: number }): number {
  return o.x;
}
print(readX(point));

// Nested fixed object promoted on dynamic key lookup.
const nested = { inner: { v: 42 } };
const nk = "inner";
print((nested as Record<string, { v: number }>)[nk].v);

// Class field holding an array literal with method calls.
class Bucket {
  items: number[] = [];
  add(n: number) {
    this.items.push(n);
  }
  summary(): string {
    return this.items.join(":");
  }
}
const bucket = new Bucket();
bucket.add(10);
bucket.add(20);
print(bucket.summary());
