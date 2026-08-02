declare function print(value: unknown): void;

const nan = 0 / 0;

switch (nan) {
  case nan:
    print("matched");
    break;
  default:
    print("default");
}

print(nan === nan);
print(-0 === 0);
