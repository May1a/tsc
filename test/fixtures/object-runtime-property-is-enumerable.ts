declare function print(value: unknown): void;

const obj: { visible?: unknown; hidden?: unknown } = {};
obj.visible = "yes";
Object.defineProperty(obj, "hidden", { value: "h", writable: true, enumerable: false, configurable: true });
if (obj.propertyIsEnumerable("visible")) {
  print("visible is enumerable");
}
if (obj.propertyIsEnumerable("hidden")) {
  print("hidden is enumerable");
} else {
  print("hidden is not enumerable");
}
