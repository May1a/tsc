declare function print(value: unknown): void;

var value = "before";
const object = {
  update() {
    value = "after";
  }
};
object.update();
print(value);
