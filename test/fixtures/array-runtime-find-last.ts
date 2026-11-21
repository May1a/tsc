declare function print(value: unknown): void;

const nums = [1, 4, 3, 8, 5];
print(nums.findLast((x: number) => x % 2 === 0));
print(nums.findLast((x: number) => x > 100));
