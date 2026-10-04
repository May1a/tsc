declare function print(value: unknown): void;

const key = "m";
const o = {
  [key]() {
    return 1;
  }
};
print(o.m());
