declare function print(value: unknown): void;

// Arithmetic on boxed / unknown operands.
function boxedNum(n: number): any {
  return n;
}
const v: any = 10;
print(boxedNum(6) * 2);
print(v - 3);
print(v / 4);
print(v % 3);
print(-v);
print(~v);

// Observable valueOf and toString fallback during ToNumber.
const withValueOf: any = {
  valueOf() {
    print("valueOf called");
    return 7;
  }
};
print(withValueOf * 3);
print(-withValueOf);

const withToString: any = {
  valueOf() {
    print("valueOf non-prim");
    return {};
  },
  toString() {
    print("toString called");
    return "15";
  }
};
print(withToString - 5);

const throwingValueOf: any = {
  valueOf() {
    throw new RangeError("bad number");
  }
};
try {
  print(throwingValueOf * 2);
} catch (e) {
  print(e instanceof RangeError);
  print((e as Error).message);
}

// String-to-number whitespace and empty edge cases.
print(Number(""));
print(Number("   "));
print(Number("  42  "));
print(Number("12x"));
print(Number(null));
print(Number(true));
print(Number(false));

// Runtime Array.prototype callback validation throws TypeError matching JS.
const arr: any = [1, 2, 3];
try {
  arr.map();
} catch (e) {
  print(e instanceof TypeError);
}
try {
  arr.find(1);
} catch (e) {
  print(e instanceof TypeError);
}
try {
  arr.forEach(1);
} catch (e) {
  print(e instanceof TypeError);
}
