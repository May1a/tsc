declare function print(value: unknown): void;

// Every loop takes a label frame, because the depth a `break label` resolves to counts *loops* between
// the jump and the one the label named. A `for…of` that took no frame made an enclosing `break outer`
// exit the `for…of` instead of the loop the label named, and made the next nested loop adopt `outer` as
// its own label. Both compiled and computed the wrong answer.
const xs = [1, 2, 3];

// A label on a `for…of`, broken from a nested `for`. The break leaves both loops.
let outer = 0;
outerLabel: for (const x of xs) {
  for (let i = 0; i < 5; i = i + 1) {
    outer = outer + 1;
    if (outer > 2) {
      break outerLabel;
    }
  }
}
print(outer);

// An unlabelled `for…of` between a label and its jump still counts as a frame, so `break` leaves the
// `while` and the statement after the `for…of` does not run.
let inner = 0;
let reached = 0;
let done = false;
whileLabel: while (!done) {
  for (const x of xs) {
    inner = inner + 1;
    if (inner > 2) {
      break whileLabel;
    }
  }
  reached = reached + 1;
  done = true;
}
print(inner);
print(reached);

// `continue` naming a `for…of` from a nested loop restarts the `for…of` rather than the inner one.
let spun = 0;
restart: for (const x of xs) {
  for (let i = 0; i < 2; i = i + 1) {
    spun = spun + 1;
    continue restart;
  }
  spun = spun + 100;
}
print(spun);