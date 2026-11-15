declare function print(value: unknown): void;

// Every Array.prototype method a dynamic call can reach, called on an `any` parameter.
function show(v: any) {
  print(v.join(","));
  print(v.toString());
  print(v.push(9, 10));
  print(v.pop());
  print(v.shift());
  print(v.unshift(-1, -2));
  print(v.join("|"));
  const middle = v.slice(1, -1);
  print(middle.join(","));
  const copy = v.slice();
  print(copy.length);
  print(v.indexOf(2));
  print(v.indexOf(2, -1));
  print(v.lastIndexOf(9));
  print(v.lastIndexOf(-1, -9));
  print(v.includes(3));
  print(v.includes(-2, -1));
  print(v.includes(NaN));
  print(v.at(-1));
  const joined = v.concat([7, 8], 6);
  print(joined.join(","));
  const reversed = v.reverse();
  print(reversed.join(","));
  const sorted = v.sort();
  print(sorted.join(","));
  const descending = v.sort((a: number, b: number) => b - a);
  print(descending.join(","));
  const doubled = v.map((x: number) => x * 2);
  print(doubled.join(","));
  const large = v.filter((x: number) => x > 1);
  print(large.join(","));
  print(v.find((x: number) => x > 2));
  print(v.findIndex((x: number) => x > 2));
  print(v.reduce((a: number, b: number) => a + b));
  print(v.reduce((a: number, b: number) => a + b, 100));
  print(v.reduceRight((a: string, b: number) => a + b, ""));
  let count = 0;
  v.forEach(() => { count += 1; });
  print(count);
  const removed = v.splice(1, 2);
  print(removed.join(","));
  print(v.join(","));
  const rest = v.splice(1);
  print(rest.join(","));
  print(v.join(","));
  const filled = v.fill(0);
  print(filled.join(","));
  const nested = v.concat([[5, [6]]]);
  const flat = nested.flat();
  print(flat.length);
  print(v.missing === undefined);
}
const start: any[] = [1, 2, 3];
show(start);

function sortWith(v: any, compare: any) {
  v.sort(compare);
}
try {
  sortWith(start, 5);
} catch (error: any) {
  print(error.name);
}
