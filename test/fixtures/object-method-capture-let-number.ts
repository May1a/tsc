declare function print(value: unknown): void;

let value = 0;
const object = {
  update() {
    value = value + 1;
  }
};
object.update();
print(value);
