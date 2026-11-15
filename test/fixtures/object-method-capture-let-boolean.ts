declare function print(value: unknown): void;

let value = false;
const object = {
  update() {
    value = true;
  }
};
object.update();
print(value);
