declare function print(value: unknown): void;

const value = {
  x: 1,
  toJSON() {
    return { x: 2 };
  }
};

print(JSON.stringify(value));
