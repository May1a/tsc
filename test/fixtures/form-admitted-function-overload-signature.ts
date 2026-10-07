declare function print(value: unknown): void;

// An overload signature is a function declaration with no body: it declares a type for the compiler to
// check calls against and emits nothing. Only the implementation signature is executable, and it is
// what declares the parameters — here an optional one, so both call shapes reach the same body.
function over(x: number): number;
function over(x: number, y: number): number;
function over(x: number, y?: number): number {
  return x + (y ?? 0);
}

print(over(1));
print(over(1, 2));

// Three signatures of differing types before the implementation, where the implementation's own
// annotation is the union of them and so is erased to the general value representation.
function pick(x: number): string;
function pick(x: string): string;
function pick(x: boolean): string;
function pick(x: number | string | boolean): string {
  return "picked";
}

print(pick(true));
print(pick("s"));

// The same erasure on a method: the signatures are dropped from the prototype and only the
// implementation is emitted.
class Counter {
  m(x: number): number;
  m(x: number, y: number): number;
  m(x: number, y?: number): number {
    return x + (y ?? 0);
  }
}

print(new Counter().m(1));
print(new Counter().m(1, 2));
