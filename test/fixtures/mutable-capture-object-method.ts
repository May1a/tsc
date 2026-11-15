declare function print(value: unknown): void;

let n = 0;
const obj = {
  inc() {
    n += 1;
  },
  get() {
    return n;
  }
};
obj.inc();
obj.inc();
print(obj.get());
