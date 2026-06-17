declare function print(value: unknown): void;
const outer: number = 1;
const inner: number = 2;
let result = 0;
switch (outer) {
  case 1:
    switch (inner) {
      case 2:
        result = 12;
        break;
      default:
        result = 10;
    }
    break;
  default:
    result = 99;
}
print(result);
