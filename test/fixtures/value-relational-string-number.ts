declare function print(value: unknown): void;
const two: any = "2";
const three: any = "3";
const four: any = "4";
const missing: any = undefined;
print(two < 3);
print(three <= 3);
print(four < 3);
print(missing > 0);
