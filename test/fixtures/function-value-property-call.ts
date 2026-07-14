declare function print(value: unknown): void;

const holder = {
  increment: (value: number): number => value + 1
};

print(holder.increment(6));
