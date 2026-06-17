declare function print(value: unknown): void;
const value: number = 2;
let result = 0;
switch (value) {
  case 1:
    result = 10;
    break;
  case 2:
    result = 20;
    break;
}
print(result);
