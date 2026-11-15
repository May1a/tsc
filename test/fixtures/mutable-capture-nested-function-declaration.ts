declare function print(value: unknown): void;

function outer() {
  let n = 0;
  function inc() {
    n += 1;
  }
  function get() {
    return n;
  }
  inc();
  inc();
  return get();
}

print(outer());
