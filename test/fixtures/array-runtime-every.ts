declare function print(value: unknown): void;

const nums = [2, 4, 6];
print(nums.every((x: number) => x % 2 === 0));
print(nums.every((x: number) => x < 5));
const empty: number[] = [];
print(empty.every((x: number) => x > 0));
