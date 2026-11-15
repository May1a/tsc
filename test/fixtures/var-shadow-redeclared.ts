declare function print(value: unknown): void;

// The first `var` declaration of a name in a function declares a new binding, even when an outer
// binding of that name is in scope; a later one in the same function redeclares it.
var x = 1;
function g(): number {
  var x = 2;
  var x = 3;
  return x;
}
print(g());
print(x);

function f(): number {
  var y = 1;
  function inner(): number {
    var y = 2;
    var y = 3;
    return y;
  }
  const r = inner();
  return r * 10 + y;
}
print(f());
