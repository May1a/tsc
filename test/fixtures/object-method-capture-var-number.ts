declare function print(value: unknown): void;

var value = 0;
const object = {
  update() {
    value = value + 1;
  }
};
object.update();
print(value);
