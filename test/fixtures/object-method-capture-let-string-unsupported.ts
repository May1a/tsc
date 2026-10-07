declare function print(value: unknown): void;

let value = "before";
const object = {
  update() {
    value = "after";
  }
};
object.update();
print(value);
