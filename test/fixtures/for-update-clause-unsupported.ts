declare function print(value: unknown): void;

function step(): void {
  print("step");
}

for (let i = 0; i < 2; step()) {
  i = i + 1;
}
