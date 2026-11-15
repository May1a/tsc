declare function print(value: unknown): void;

class Box {
  #tag = "original";
  set #value(value: any) {
    print(this.#tag);
    print(value);
  }
  putChanged(receiver: any, replacement: any) {
    function change() {
      print("change");
      receiver = replacement;
      return 2;
    }
    receiver.#value = change();
  }
  putEffects(getReceiver: any, getValue: any) {
    getReceiver().#value = getValue();
  }
}
const box = new Box();
box.putChanged(box, {});
try {
  box.putChanged({}, box);
} catch (error: any) {
  print(error.name);
}
function receiver() {
  print("receiver");
  return box;
}
function rhs() {
  print("rhs");
  return 3;
}
box.putEffects(receiver, rhs);
function invalidReceiver() {
  print("invalid receiver");
  return {};
}
function throwingRhs() {
  print("throwing rhs");
  throw new Error("rhs error");
}
try {
  box.putEffects(invalidReceiver, throwingRhs);
} catch (error: any) {
  print(error.message);
}
function throwingReceiver() {
  print("throwing receiver");
  throw new Error("receiver error");
}
try {
  box.putEffects(throwingReceiver, rhs);
} catch (error: any) {
  print(error.message);
}
