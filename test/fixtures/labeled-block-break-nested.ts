declare function print(value: unknown): void;

// break targeting an outer labeled block from inside a loop.
outer: {
  for (let i = 0; i < 5; i++) {
    if (i === 2) {
      break outer;
    }
    print(i);
  }
  print("unreachable");
}
print("done");
