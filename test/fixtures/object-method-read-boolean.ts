declare function print(value: unknown): void;

let value = false;
const object = {
  read() {
    return value;
  }
};
print(object.read());
