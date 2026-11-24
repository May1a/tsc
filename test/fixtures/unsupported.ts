declare function print(value: unknown): void;

if (eval("1")) {
  print("not lowered yet");
}
