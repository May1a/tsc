declare function print(value: unknown): void;

// The plan's own syntax: a label on a loop, broken from a nested one. The break leaves *both* loops, which
// is the whole point of the label and the thing an unlabelled break cannot express.
let first = 0;
outer: while (first < 10) {
  while (first < 10) {
    first = first + 1;
    break outer;
  }
}
print(first);

// `continue` on a label leaves the nested loop and continues the named one, so the outer loop's condition
// is what decides how many rounds run.
let rounds = 0;
top: while (rounds < 3) {
  rounds = rounds + 1;
  while (rounds < 3) {
    rounds = rounds + 10;
    continue top;
  }
}
print(rounds);

// An unlabelled break beside a labelled one: the inner break leaves only the inner loop, and the outer one
// is left by its own label. The two are different operations over the same nesting.
let inner = 0;
wrap: while (inner < 10) {
  while (inner < 10) {
    inner = inner + 1;
    break;
  }
  break wrap;
}
print(inner);

// Three levels, broken from the deepest. The depth is a count of loops between the jump and the target, so
// an unlabelled loop in between still counts.
let deep = 0;
bottom: while (deep < 10) {
  while (deep < 10) {
    while (deep < 10) {
      deep = deep + 1;
      break bottom;
    }
  }
}
print(deep);

// A label on a `for` loop, broken out of two nested `for` bodies.
let stepped = 0;
count: for (let a = 0; a < 5; a = a + 1) {
  for (let b = 0; b < 5; b = b + 1) {
    stepped = stepped + 1;
    if (stepped > 2) {
      break count;
    }
  }
}
print(stepped);

// A label on a `do ... while`, continued from its own body, so the label names the loop the `continue`
// restarts rather than an enclosing one.
let spun = 0;
spin: do {
  spun = spun + 1;
  if (spun < 2) {
    continue spin;
  }
  break spin;
} while (spun < 10);
print(spun);

// A labelled `for ... of`, the shape the plan writes: breaking out of the nested loop ends the iteration.
outer: for (const a of [1, 2, 3]) {
  for (const b of [4, 5, 6]) {
    break outer;
  }
}
print("done");
