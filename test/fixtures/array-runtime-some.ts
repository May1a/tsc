declare function print(value: unknown): void;

const nums = [1, 3, 4, 7];
print(nums.some((x: number) => x % 2 === 0));
print(nums.some((x: number) => x > 10));
const empty: number[] = [];
print(empty.some((x: number) => x > 0));
