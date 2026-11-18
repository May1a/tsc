declare function print(value: unknown): void;

// break targeting a labeled if-statement.
function run(x: number): void {
  check: if (x > 0) {
    if (x > 10) {
      break check;
    }
    print("in range");
  }
  print("done");
}

run(5);  // in range, done
run(15); // done
run(-1); // done
