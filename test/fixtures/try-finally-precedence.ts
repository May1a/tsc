declare function print(value: unknown): void;

function returnFromCatch(): number {
  try {
    throw "caught";
  } catch {
    return 3;
  } finally {
    print("catch-finally");
  }
}

function throwFromFinally(): number {
  try {
    return 4;
  } finally {
    throw "replacement";
  }
}

print(returnFromCatch());
try {
  print(throwFromFinally());
} catch (error) {
  print(error);
}
