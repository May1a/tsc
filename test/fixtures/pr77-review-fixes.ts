declare function print(value: unknown): void;

// 1. Boxed null.length throws TypeError instead of crashing (both direct and wrapped).
const maybeNull: any = null;
try {
  print(maybeNull.length);
} catch (err) {
  print(err instanceof TypeError);
}
try {
  print((maybeNull as { length: number }).length);
} catch (err) {
  print(err instanceof TypeError);
}

// 2. Class field initializer sees outer binding, not constructor-local hoisted var.
let outerVal = 7;
class FieldScope {
  value = outerVal;
  constructor() {
    if (false) {
      var outerVal = 1;
    }
  }
}
print(new FieldScope().value);

// 3 & 4. Destructured parameters in functions and class methods are not shadowed by nested var.
function keepFn({ x }: { x: number }): number {
  if (false) {
    var x = 99;
  }
  return x;
}
print(keepFn({ x: 42 }));

class DestructureMethod {
  keep({ x }: { x: number }): number {
    if (false) {
      var x = 88;
    }
    return x;
  }
}
print(new DestructureMethod().keep({ x: 55 }));

// 5 & 10. Binary arithmetic evaluates right operand before left.valueOf() and roots across GC.
let rightFactor = 2;
const mutatingLeft: unknown = {
  valueOf() {
    const noise = [];
    for (let i = 0; i < 64; i += 1) {
      noise.push({ k: i });
    }
    rightFactor = 10;
    return 6;
  }
};
print((mutatingLeft as number) * rightFactor);
print(rightFactor);

const orderLog: string[] = [];
function getLeft(): unknown {
  orderLog.push("eval-L");
  return {
    valueOf() {
      orderLog.push("coerce-L");
      return 3;
    }
  };
}
function getRight(): unknown {
  orderLog.push("eval-R");
  return {
    valueOf() {
      orderLog.push("coerce-R");
      return 4;
    }
  };
}
print((getLeft() as number) * (getRight() as number));
print(orderLog.join(","));

// 6. Hoisted var initialized with spread/hole array literal.
const seed = [1, 2, 3];
if (true) {
  var spreadCopy = [...seed, 4];
}
print(spreadCopy.length);
print(spreadCopy[3]);

// 7. Deep chained method calls stay linear in IR size and evaluate once per step.
const deep = [1, 2, 3, 4]
  .slice(0).slice(0).slice(0).slice(0).slice(0)
  .slice(0).slice(0).slice(0).slice(0).slice(0)
  .slice(0).slice(0).slice(0).slice(0).slice(0)
  .slice(0).slice(0).slice(0);
print(deep.length);

// 8. Dynamic numeric element-access method call evaluates receiver once and calls selected index.
let getterCalls = 0;
function getFunctions() {
  getterCalls += 1;
  return [() => 10, () => 20];
}
const fnIdx = 1;
print(getFunctions()[fnIdx]());
print(getterCalls);

// 9. Dynamic element access on call result reads the dynamic index, not index 0.
function makePair() {
  return [100, 200, 300];
}
const elemIdx = 2;
print(makePair()[elemIdx]);

// 11 & 15. console.log format specifiers and loop-safe entry-block argument buffer.
console.log("count: %d", 5);
console.log("s=%s d=%d i=%i f=%f j=%j o=%o O=%O pct=%%", "hi", 3.7, 3.7, 3.7, { a: 1 }, { a: 1 }, { a: 1 });
console.log("extra %d", 1, 2);
console.log("missing %d %d", 1);
console.log("100%%");
console.log("100%%", 1);
console.log("unknown %q", 9);

let logCount = 0;
for (let i = 0; i < 20; i += 1) {
  if (i === 19) {
    console.log("loop-done", i);
  }
  logCount += 1;
}
print(logCount);

// 12 & 13. Strict JS ToNumber string parsing (CR whitespace, exact Infinity, reject inf/nan/hex-float).
const numInputs: unknown[] = [
  "\r",
  " \r\n 42 \r ",
  "inf",
  "INF",
  "INFINITY",
  "nan",
  "NaN",
  "0x1p2",
  "+0x10",
  "0x10",
  "0b101",
  "0o10",
  "Infinity",
  "-Infinity",
  "+Infinity",
  "-0"
];
for (const raw of numInputs) {
  print(Number(raw));
}

// 14. Object.prototype.isPrototypeOf accepts functions.
const sampleFn = () => 1;
const sampleObj: { a?: number } = {};
sampleObj.a = 1;
const objProto = Object.getPrototypeOf(sampleObj);
print(objProto.isPrototypeOf(sampleFn));
