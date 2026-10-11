declare function print(value: unknown): void;

let value = "outer";
const object = {
  read() {
    return value;
  }
};
print(object.read());
