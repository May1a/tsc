declare function print(value: unknown): void;

let number = 1;
let text = "outer";
let flag = false;
const object = {
  parameter(number: number) {
    print(number);
  },
  local() {
    let number = 2;
    let text = "local";
    let flag = false;
    number = number + 1;
    text = text + "!";
    flag = true;
    print(number);
    print(text);
    print(flag);
  }
};
object.parameter(4);
object.local();
print(number);
print(text);
print(flag);
