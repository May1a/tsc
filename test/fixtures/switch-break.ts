declare function print(value: unknown): void;
const value: number = 1;
let result = 0;
switch (value) {
  case 1:
    result = 1;
    break;
  case 2:
    result = 2;
}
print(result);
