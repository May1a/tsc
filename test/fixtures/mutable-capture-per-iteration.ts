declare function print(value: unknown): void;

// A `let` or `const` declared in a loop body is a fresh binding on every iteration, so each closure
// keeps the value of the iteration that created it. A `var` is one binding for the whole frame.
const moduleItems: any[] = [];
for (const k of ["a", "b"]) {
  moduleItems.push(() => k);
}
print(moduleItems[0]());
print(moduleItems[1]());

const moduleObjects: any[] = [];
for (const k of ["a", "b"]) {
  const o = { k };
  moduleObjects.push(() => o.k);
}
print(moduleObjects[0]());
print(moduleObjects[1]());

function inFunction(): void {
  const items: any[] = [];
  for (const k of ["c", "d"]) {
    const suffixed = k + "!";
    items.push(() => suffixed);
  }
  print(items[0]());
  print(items[1]());

  const counters: any[] = [];
  for (let i = 0; i < 2; i++) {
    let c = i;
    counters.push(() => {
      c += 10;
      return c;
    });
  }
  print(counters[0]());
  print(counters[0]());
  print(counters[1]());

  const whileItems: any[] = [];
  let n = 0;
  while (n < 2) {
    const m = n;
    whileItems.push(() => m);
    n++;
  }
  print(whileItems[0]());
  print(whileItems[1]());

  const shared: any[] = [];
  for (let i = 0; i < 3; i++) {
    var v = i * 10;
    shared.push(() => v);
  }
  print(shared[0]());
}
inFunction();

// A `for (let ...)` header is copied into a fresh binding before each update, so the update does
// not reach a closure created in the previous iteration. A `var` header is shared.
const headers: any[] = [];
for (let i = 0; i < 3; i++) {
  headers.push(() => i);
}
print(headers[0]());
print(headers[2]());

function headerUpdatedInBody(): void {
  const fns: any[] = [];
  for (let i = 0; i < 3; i++) {
    fns.push(() => i);
    i += 0;
  }
  print(fns[1]());
}
headerUpdatedInBody();

const varHeaders: any[] = [];
for (var j = 0; j < 3; j++) {
  varHeaders.push(() => j);
}
print(varHeaders[0]());

// A binding declared outside the loop is one binding that every closure shares.
function outerAccumulator(): number {
  let total = 0;
  for (let i = 0; i < 3; i++) {
    const add = () => {
      total += i;
    };
    add();
  }
  return total;
}
print(outerAccumulator());
