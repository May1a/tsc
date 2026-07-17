declare function print(value: unknown): void;

const source: any = Object.create(null);
source.length = 2;
source["0"] = 2;
source["1"] = 3;
const result = Array.from(source, function (this: { offset: number }, value, index) {
  return Number(value) + Number(index) + Number(this.offset);
}, { offset: 4 });

print(result.length);
print(result[0]);
print(result[1]);
