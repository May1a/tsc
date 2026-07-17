declare function print(value: unknown): void;

function mapIterator(): any {
  return {
    index: 0,
    next(this: any) {
      let index = Number(this.index);
      if (index === 0) {
        this.index = 1;
        return { value: ["override", 9], done: false };
      }
      return { value: undefined, done: true };
    }
  };
}

function setIterator(): any {
  return {
    index: 0,
    next(this: any) {
      let index = Number(this.index);
      if (index === 0) {
        this.index = 1;
        return { value: "override", done: false };
      }
      return { value: undefined, done: true };
    }
  };
}

const sourceMap: any = new Map<unknown, unknown>();
sourceMap.set("original", 1);
sourceMap[Symbol.iterator] = mapIterator;
const copiedMap = new Map(sourceMap);
print(copiedMap.size);
print(copiedMap.get("override"));

const sourceSet: any = new Set<unknown>();
sourceSet.add("original");
sourceSet[Symbol.iterator] = setIterator;
const copiedSet = new Set(sourceSet);
print(copiedSet.size);
print(copiedSet.has("override"));

const array = Array.from(sourceMap);
print(array.length);
const entry: any = array[0];
print(entry[0]);
