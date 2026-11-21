function* count(start: number, end: number): Generator<number, number, number> {
  let sum = 0;
  for (let i = start; i <= end; i++) {
    const sent = yield i;
    sum = sum + (sent ?? 0);
  }
  return sum;
}

const g = count(1, 3);
const r1 = g.next();
const r2 = g.next(10);
const r3 = g.next(20);
const r4 = g.next(30);
const r5 = g.next(99);
console.log(r1.value, r1.done, r2.value, r2.done, r3.value, r3.done, r4.value, r4.done, r5.value, r5.done);

function* letters(): Generator<string, string, undefined> {
  yield "a";
  yield "b";
  return "z";
}

function* delegated(): Generator<string, string, undefined> {
  yield "start";
  const ret = yield* letters();
  yield ret;
  return "done";
}

const items: string[] = [];
for (const x of delegated()) {
  items.push(x);
}
console.log(items.join(","));

function* withCleanup(): Generator<number, number, undefined> {
  try {
    yield 1;
    yield 2;
  } catch (e) {
    console.log("caught:" + String(e));
    yield 99;
  } finally {
    console.log("finally");
  }
  return 3;
}

const c1 = withCleanup();
console.log(c1.next().value);
const cr = c1.return(42);
console.log(cr.value, cr.done);

const c2 = withCleanup();
console.log(c2.next().value);
const ct = c2.throw("err");
console.log(ct.value, ct.done);
const cd = c2.next();
console.log(cd.value, cd.done);

const genExpr = function* (n: number) {
  let i = 0;
  while (i < n) {
    yield i * 2;
    i++;
  }
};
const genArr = [...genExpr(3)];
console.log(genArr.join(","));
