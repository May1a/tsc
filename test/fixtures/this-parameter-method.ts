declare function print(value: unknown): void;

class Counter {
  private total: number = 0;

  add(this: Counter, amount: number): number {
    this.total = this.total + amount;
    return this.total;
  }
}

const counter = new Counter();
print(counter.add(3));
print(counter.add(4));
print("done");
