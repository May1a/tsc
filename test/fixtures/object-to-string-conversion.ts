declare function print(value: unknown): void;

// ToString of an object runs its own `toString`, then `valueOf`; `+` tries `valueOf` first.
const named: any = { toString() { return "x"; } };
print(String(named));
print(`${named}`);
print("a" + named);
const both: any = { toString() { return "t"; }, valueOf() { return 7; } };
print(String(both));
print(`${both}`);
print("a" + both);

// An object with neither method keeps its built-in form, and `print` writes `String(value)`.
function make(): any { return { a: 1 }; }
print(String(make()));
print([1, [2, 3]] + "");
class Temperature {
  celsius: number;
  constructor(celsius: number) { this.celsius = celsius; }
  toString() { return `${this.celsius}C`; }
}
const today = new Temperature(21);
print(`now ${today}`);
print(today);

// A method that returns an object is passed over, and a TypeError follows when both do. A throw
// from the method propagates.
const opaque: any = { toString() { return {}; }, valueOf() { return {}; } };
try { print(String(opaque)); } catch (thrown: any) { print(thrown.name); }
const failing: any = { toString() { throw new RangeError("no"); } };
try { print(`${failing}`); } catch (thrown: any) { print(thrown.name); }

// A computed class member name converts once, when the class is defined.
let conversions = 0;
const key: any = { toString() { conversions += 1; return "k"; } };
class Keyed { [key] = 1; }
const first = new Keyed();
const second = new Keyed();
print(conversions);
print(first !== second);

// The left operand of a concatenation survives a right operand whose `toString` allocates.
const allocating: any = { toString() { return `b${"c".repeat(3)}`; } };
print("a-" + allocating);
