declare function print(value: unknown): void;
let n = 0;
function fail(): number { throw "default failed"; }
function destructuring({ x = fail() }: { x?: number }, y = ++n) { print(y); }
try { destructuring({}); } catch (error) { print(error); }
print(n);
function nullish({ x }: any, y = ++n) { print(y); }
try { nullish(null); } catch { print("nullish failed"); }
print(n);
function outer({ x }: { x: number }, read = () => x) {
  function nested() { return x; }
  print(read());
  print(nested());
}
outer({ x: 17 });
