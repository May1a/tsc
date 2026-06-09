declare function print(value: unknown): void;

const proto: { inherited?: unknown; deleted?: unknown; explicit?: unknown } = {
  inherited: "proto",
  deleted: "proto",
  explicit: "proto"
};
const obj: { own?: unknown; inherited?: unknown; deleted?: unknown; explicit?: unknown; missing?: unknown } = Object.create(proto);
obj.own = undefined;
obj.explicit = undefined;
obj.deleted = "own";
delete obj.deleted;

print("own" in obj);
print(Object.hasOwn(obj, "own"));
print("inherited" in obj);
print(Object.hasOwn(obj, "inherited"));
print("deleted" in obj);
print(Object.hasOwn(obj, "deleted"));
print("missing" in obj);
