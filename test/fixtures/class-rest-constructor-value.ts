declare function print(value: unknown): void;

class Rest {
  first: string;
  rest: number[];
  constructor(first: string, ...rest: number[]) { this.first = first; this.rest = rest; }
}
const make = (constructor: any): any => new constructor("k", 7, 8);
print(make(Rest).first + make(Rest).rest.join());
const key: any = Symbol.for("key");
class Keyed { [name: symbol]: unknown; [key] = 4; }
const read = (o: any, k: any): any => o[k];
print(read(new Keyed(), key));
const has = (o: any, k: any): boolean => k in o;
print(has(new Keyed(), key));
const extended: any = Object.assign((x: any) => x, { tag: 5 });
print(extended.tag + extended(2));
