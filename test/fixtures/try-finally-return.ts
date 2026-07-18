declare function print(value: unknown): void;

function withFinally(): number {
  try {
    return 1;
  } finally {
    print("cleanup");
  }
}

function replaceReturn(): number {
  try {
    return 1;
  } finally {
    return 2;
  }
}

print(withFinally());
print(replaceReturn());
