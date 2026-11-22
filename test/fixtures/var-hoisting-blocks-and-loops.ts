declare function print(value: unknown): void;

// Top-level nested var inside blocks, branches, try, and loops.
if (true) {
  var taken: any = 11;
}
if (false) {
  var untaken: any = 22;
}
print(taken);
print(untaken);

{
  var inBlock: any = "block-val";
}
print(inBlock);

try {
  var inTry: any = 99;
} catch {
  var inCatch: any = 0;
}
print(inTry);
print(inCatch);

for (var i = 0; i < 3; i++) {
  var lastIter: any = i * 10;
}
print(i);
print(lastIter);

for (var item of [4, 5, 6] as any[]) {
  var doubled: any = item * 2;
}
print(item);
print(doubled);

const rec = { first: 1, second: 2 };
for (var prop in rec) {
  var lastProp: any = prop;
}
print(prop!);
print(lastProp);

// Function-scoped nested var.
function checkFn(flag: boolean): string {
  if (flag) {
    var msg: any = "yes";
  }
  for (var n = 0; n < 2; n++) {
    var acc: any = n + 1;
  }
  return String(msg) + ":" + String(n) + ":" + String(acc);
}
print(checkFn(true));
print(checkFn(false));

// Arrow function and class method nested var.
const arrowCheck = (flag: boolean) => {
  if (flag) {
    var out: any = 7;
  }
  return out;
};
print(arrowCheck(true));
print(arrowCheck(false));

class Box {
  compute(limit: number): number {
    for (var j = 0; j < limit; j++) {
      var seen: any = j;
    }
    return j + seen;
  }
}
print(new Box().compute(4));
