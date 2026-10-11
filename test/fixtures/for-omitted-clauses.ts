declare function print(value: unknown): void;

// No update clause: the body advances the counter itself.
let c = 0;
for (let x = 0; x < 3;) {
  x++;
  c++;
}
print(c);

// No condition: an omitted condition is `true`, so the body breaks out.
for (let y = 0; ; y++) {
  if (y > 2) {
    break;
  }
  c++;
}
print(c);

// Neither: `for (;;)` loops until the body breaks.
for (;;) {
  c++;
  if (c > 10) {
    break;
  }
}
print(c);

// No initializer: the loop reads and writes the outer binding.
let z = 0;
for (; z < 2; z++) {
  c++;
}
print(c);

// `continue` without an update still reaches the condition.
for (let s = 0; s < 5;) {
  s++;
  if (s < 3) {
    continue;
  }
  c++;
}
print(c);

// `continue` in `for (;;)` restarts the body.
let t = 0;
for (;;) {
  t++;
  if (t < 3) {
    continue;
  }
  break;
}
print(t);

// A labelled `continue` to an outer loop without an update continues the named loop, skipping the
// rest of the inner body and the outer body below it.
let outer = 0;
let inner = 0;
done: for (let o = 0; o < 3;) {
  o++;
  for (let i = 0; i < 5; i++) {
    inner++;
    if (i < 2) {
      continue;
    }
    outer++;
    continue done;
  }
}
print(outer);
print(inner);

// A closure capturing a per-iteration copy in a loop without an update: each iteration binds a
// fresh `const` from the counter and the closure reads that iteration's value.
for (let v = 0; v < 3;) {
  const copy = v * 2;
  const get = (): number => copy;
  print(get());
  v++;
}
