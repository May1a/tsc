declare function print(value: unknown): void;

// break targeting a labeled non-loop block.
outer: {
  print("before");
  break outer;
  print("unreachable");
}
print("after");
