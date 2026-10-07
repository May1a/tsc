declare function print(value: unknown): void;

// The initializer is a declaration list, so it declares every name before the condition runs.
for (let i = 0, j = 1; i < 3; i++) {
  print(j + i);
}

// A declarator that reads the one before it, which fixes the order the bindings have to be folded in.
for (let i = 1, j = i * 10; i < 3; i++) {
  print(j);
}

// Three declarators, and a read of the accumulator from inside the loop: `let` in a `for` initializer
// is scoped to the loop, so the names are not visible after it.
for (let i = 0, sum = 0, step = 2; i < 6; i = i + step) {
  sum = sum + i;
  print(sum);
}

// A decrementing incrementor stepping only the first of two declarations.
for (let i = 4, j = 100; i > 0; i--) {
  j = j - 1;
  if (i === 1) {
    print(j);
  }
}
