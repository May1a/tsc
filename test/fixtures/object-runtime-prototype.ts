declare function print(value: unknown): void;

const proto: { inherited?: unknown; shadow?: unknown; explicit?: unknown; deleted?: unknown } = {
  inherited: "proto",
  shadow: "proto",
  explicit: "proto",
  deleted: "proto"
};

const obj: { inherited?: unknown; shadow?: unknown; explicit?: unknown; deleted?: unknown; missing?: unknown } = Object.create(proto);
obj.shadow = "own";
obj.explicit = undefined;
obj.deleted = "own";
delete obj.deleted;

print(obj.inherited);
print(obj.shadow);
print(obj.explicit);
print(obj.deleted);
print(obj.missing);
