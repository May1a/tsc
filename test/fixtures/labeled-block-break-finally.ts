declare function print(value: unknown): void;

function fail(): void {
  throw new Error("fail");
}

// A `break` in a `finally` leaves the labeled block from the exception route, which is emitted after the
// try body; the block's break target has to survive until then.
function breakFromFinally(): string {
  out: {
    try {
      fail();
    } finally {
      break out;
    }
  }
  return "broke out of finally";
}
print(breakFromFinally());

// The `finally` runs before the break reaches the end of the block.
done: {
  try {
    break done;
  } finally {
    print("finally before break");
  }
}
print("after block");

// A `return` inside a labeled block runs the `finally` inline; a sibling label with the same name in the
// `finally` names a different statement.
function siblingLabels(): number {
  try {
    same: {
      return 1;
    }
  } finally {
    same: {
      print("finally label");
      break same;
    }
  }
}
print(siblingLabels());
