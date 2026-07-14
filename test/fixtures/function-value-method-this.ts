declare function print(value: unknown): void;

const holder = {
  base: 4,
  add(value: number): number {
    return Number(this.base) + value;
  }
};

print(holder.add(3));
