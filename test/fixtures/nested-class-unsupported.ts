declare function print(value: unknown): void;

function make(): void {
  class Inner {
    m(): number {
      return 1;
    }
  }
  print("made");
}

make();
