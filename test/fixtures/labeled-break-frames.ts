declare function print(value: unknown): void;

// `break label` from a `switch` leaves the labeled loop, not the switch.
let rounds = 0;
loop: while (true) {
  rounds = rounds + 1;
  switch (rounds) {
    case 3:
      break loop;
    default:
      break;
  }
}
print(rounds);

// A label on a `switch` is a labeled block around it.
named: switch (2) {
  case 2: {
    print("two");
    break named;
  }
  default:
    print("unreachable");
}

// An unlabelled `break` skips labeled blocks to reach the innermost loop; `continue` does too.
let steps = 0;
while (true) {
  steps = steps + 1;
  block: {
    if (steps < 3) {
      break block;
    }
    break;
  }
}
print(steps);
let odd = 0;
count: for (let i = 0; i < 6; i++) {
  skip: {
    if (i % 2 === 0) {
      continue count;
    }
    if (i === 5) {
      break skip;
    }
    odd = odd + i;
  }
}
print(odd);

// A function's labels are its own: the outer block label does not capture the inner loop's.
same: {
  const inner = (): number => {
    let n = 0;
    same: while (true) {
      n = n + 1;
      if (n > 2) {
        break same;
      }
    }
    return n;
  };
  print(inner());
}
