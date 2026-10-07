declare function print(value: unknown): void;

let value = 0;
const object = {
  read() {
    return value;
  }
};
print(object.read());
