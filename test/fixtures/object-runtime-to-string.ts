declare function print(value: unknown): void;

class Widget {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

class NamedWidget extends Widget {
  override toString(): string {
    return `Widget(${this.name})`;
  }
}

const plain: { a?: unknown } = {};
plain.a = "one";
print(plain.toString());

const widget = new Widget("gear");
print(widget.toString());

const named = new NamedWidget("bolt");
print(named.toString());

const err = new TypeError("bad");
print(err.toString());

const self = plain.valueOf();
print(self === plain);
print(widget.valueOf() === widget);
print(widget.hasOwnProperty("name"));
print(widget.hasOwnProperty("missing"));
print(widget.propertyIsEnumerable("name"));
print(widget.propertyIsEnumerable("missing"));
