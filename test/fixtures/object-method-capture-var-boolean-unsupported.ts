declare function print(value: unknown): void;

var value = false;
const object = {
  update() {
    value = true;
  }
};
object.update();
print(value);
