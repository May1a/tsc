declare function print(value: unknown): void;

function choose(flag: number): unknown {
  return flag === 1 ? 7 : true;
}

print(choose(0));
print(choose(1));
