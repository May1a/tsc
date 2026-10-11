declare function print(value: unknown): void;

let s = "a";
let flag = true;
const bump = () => {
  s += "x";
  flag = !flag;
};
bump();
bump();
print(s);
print(flag);
