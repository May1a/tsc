declare function print(value: unknown): void;

function nestedReturn(): number {
  try {
    return 1;
  } finally {
    try {
      print("inner-try");
    } finally {
      print("inner-finally");
    }
  }
}

print(nestedReturn());
