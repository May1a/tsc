declare function print(value: unknown): void;

// Two loops that declare the same name. LLVM requires local names to be unique within a function and a
// slot is named after the binding it holds, so the second `i` used to allocate the same `%i.addr` as the
// first and clang rejected the module — a program that typechecks and is correct, refused over the name
// of an internal slot.
for (let i = 0; i < 2; i = i + 1) {
  print(i);
}

for (let i = 0; i < 3; i = i + 1) {
  print(i + 10);
}

// A string binding repeated the same way, and interleaved with the loops so the collisions are not
// adjacent: the uniquing has to be per function, not per loop.
let s = "a";
for (let i = 0; i < 2; i = i + 1) {
  s = "b";
}
for (let i = 0; i < 2; i = i + 1) {
  print(s);
}
print(s);

// The same name reused in a nested function is not a collision: LLVM scopes local names per function,
// and each function is emitted with its own context.
function inner(): number {
  let i = 100;
  return i;
}

for (let i = 0; i < 1; i = i + 1) {
  print(inner());
}
