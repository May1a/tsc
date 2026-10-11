declare function print(value: unknown): void;

let n = 0;

class Counter {
  inc() {
    n += 2;
  }
  get() {
    return n;
  }
}

const counter = new Counter();
counter.inc();
print(counter.get());
n += 1;
print(counter.get());
