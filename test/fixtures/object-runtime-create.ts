declare function print(value: unknown): void;

const proto: { inherited?: unknown } = {};
proto.inherited = "from-proto";
const obj = Object.create(proto) as { own?: unknown; inherited?: unknown };
obj.own = "own";
print(obj.inherited);
print(obj.own);
print("inherited" in obj);
