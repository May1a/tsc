export type RuntimeHelper =
  | "malloc"
  | "memcpy"
  | "memcmp"
  | "sprintf"
  | "strConcat"
  | "strEquals"
  | "valueStrictEquals"
  | "valueBoxString"
  | "valueStringPtr"
  | "valueStringLength"
  | "valueBoxObject"
  | "valueBoxArray"
  | "valueObjectPtr"
  | "valueArrayPtr"
  | "valueIsObject"
  | "valueIsArray"
  | "valueObjectGet"
  | "valueArrayGet"
  | "valueArrayLength"
  | "valueObjectSet"
  | "valueArraySet"
  | "valueArraySetLength"
  | "valueObjectDelete"
  | "valueArrayDelete"
  | "valueObjectHasOwn"
  | "valueObjectKeys"
  | "valueObjectValues"
  | "valueObjectEntries"
  | "valueObjectOwnPropertyDescriptor"
  | "valueObjectOwnPropertyNames"
  | "valueObjectOwnPropertyDescriptors"
  | "objectEntries"
  | "objectFromEntries"
  | "arrayEntries"
  | "objectOwnPropertyNames"
  | "arrayOwnPropertyNames"
  | "arrayOwnPropertyDescriptors"
  | "objectOwnPropertyDescriptors"
  | "valueTruthy"
  | "valuePrint"
  | "valueToString"
  | "indexToString"
  | "arrayNew"
  | "arrayLength"
  | "arrayGet"
  | "arrayGetWithKey"
  | "arraySetNamed"
  | "arrayDeleteNamed"
  | "arraySet"
  | "arrayDelete"
  | "arraySetLength"
  | "arrayHasOwnIndex"
  | "arrayHas"
  | "arrayKeys"
  | "arrayValues"
  | "arrayOwnPropertyDescriptor"
  | "arrayLengthPropertyDescriptor"
  | "arrayIncludes"
  | "arrayIndexOf"
  | "arrayLastIndexOf"
  | "arrayAt"
  | "arrayCopyWithin"
  | "arraySlice"
  | "arrayJoin"
  | "arrayConcat"
  | "arrayAppendElements"
  | "arrayFill"
  | "arrayReverse"
  | "arrayPush"
  | "arrayPop"
  | "arrayUnshift"
  | "arrayShift"
  | "arraySetPrototype"
  | "arrayGetPrototype"
  | "objectNew"
  | "objectCreate"
  | "objectGetOwn"
  | "objectGet"
  | "objectHasOwn"
  | "objectHas"
  | "objectSetPrototype"
  | "objectWouldCreateCycle"
  | "objectGetPrototype"
  | "objectPreventExtensions"
  | "objectIsExtensible"
  | "objectSeal"
  | "objectFreeze"
  | "objectIsSealed"
  | "objectIsFrozen"
  | "objectAssign"
  | "objectAssignArray"
  | "valueObjectAssign"
  | "objectDefineDataProperty"
  | "objectValues"
  | "objectOwnPropertyDescriptor"
  | "objectPropertyIsEnumerable"
  | "objectKeys"
  | "objectDelete"
  | "objectSet";

export type RuntimeHelperEmitter = {
  readonly used: Set<RuntimeHelper>;
};

export const createRuntimeHelperEmitter = (): RuntimeHelperEmitter => ({ used: new Set() });

const runtimeHelperDependencies = new Map<RuntimeHelper, readonly RuntimeHelper[]>([
  ["strConcat", ["malloc", "memcpy"]],
  ["strEquals", ["memcmp"]],
  ["valueStrictEquals", ["valueStringLength", "valueStringPtr", "memcmp"]],
  ["arrayNew", ["malloc", "objectNew"]],
  ["objectNew", ["malloc"]],
  ["valueBoxString", ["malloc"]],
  ["valuePrint", ["valueStringPtr"]],
  ["valueToString", ["valueStringPtr", "valueStringLength", "valueArrayPtr", "arrayJoin", "malloc", "sprintf"]],
  ["valueStringPtr", ["valueBoxString"]],
  ["valueStringLength", ["valueBoxString"]],
  ["valueBoxObject", ["malloc"]],
  ["valueBoxArray", ["malloc"]],
  ["valueObjectPtr", []],
  ["valueArrayPtr", []],
  ["valueObjectGet", ["valueObjectPtr", "objectGet"]],
  ["valueArrayGet", ["valueArrayPtr", "arrayGetWithKey"]],
  ["valueArrayLength", ["valueArrayPtr", "arrayLength"]],
  ["valueObjectSet", ["valueObjectPtr", "objectSet"]],
  ["valueArraySet", ["valueArrayPtr", "arraySet"]],
  ["valueArraySetLength", ["valueArrayPtr", "arraySetLength"]],
  ["valueObjectDelete", ["valueObjectPtr", "objectDelete"]],
  ["valueArrayDelete", ["valueArrayPtr", "arrayDelete"]],
  ["valueObjectHasOwn", ["valueObjectPtr", "valueArrayPtr", "objectHasOwn", "arrayHasOwnIndex"]],
  ["valueObjectKeys", ["valueObjectPtr", "valueArrayPtr", "objectKeys", "arrayKeys", "arrayNew"]],
  ["valueObjectValues", ["valueObjectPtr", "valueArrayPtr", "objectValues", "arrayValues", "arrayNew"]],
  ["valueObjectEntries", ["valueObjectPtr", "valueArrayPtr", "objectEntries", "arrayEntries", "arrayNew"]],
  ["valueObjectOwnPropertyDescriptor", ["valueObjectPtr", "valueArrayPtr", "objectOwnPropertyDescriptor", "arrayOwnPropertyDescriptor", "arrayLengthPropertyDescriptor", "memcmp"]],
  ["valueObjectOwnPropertyNames", ["valueObjectPtr", "valueArrayPtr", "objectOwnPropertyNames", "arrayOwnPropertyNames", "arrayNew"]],
  ["valueObjectOwnPropertyDescriptors", ["valueObjectPtr", "valueArrayPtr", "objectOwnPropertyDescriptors", "arrayOwnPropertyDescriptors", "objectNew"]],
  ["objectEntries", ["arrayNew", "arraySet", "valueBoxString", "valueBoxArray"]],
  ["objectFromEntries", ["objectNew", "objectSet", "arrayLength", "arrayHasOwnIndex", "valueArrayPtr", "arrayGet", "valueStringPtr", "valueStringLength", "valueIsArray"]],
  ["arrayEntries", ["arrayLength", "arrayHasOwnIndex", "arrayNew", "arraySet", "indexToString", "valueBoxString", "valueBoxArray", "objectEntries", "arrayAppendElements"]],
  ["objectOwnPropertyNames", ["arrayNew", "arraySet", "valueBoxString"]],
  ["arrayOwnPropertyNames", ["arrayLength", "arrayHasOwnIndex", "arrayNew", "arraySet", "arrayPush", "valueBoxString", "indexToString", "objectOwnPropertyNames", "arrayAppendElements"]],
  ["objectOwnPropertyDescriptors", ["objectNew", "objectOwnPropertyDescriptor", "objectSet"]],
  ["valueTruthy", ["valueStringLength"]],
  ["indexToString", ["malloc"]],
  ["arrayGet", ["arrayLength"]],
  ["arrayGetWithKey", ["arrayLength", "arrayHasOwnIndex", "objectGet", "objectGetOwn", "memcmp"]],
  ["arraySetNamed", ["objectSet"]],
  ["arrayDeleteNamed", ["objectDelete"]],
  ["arraySet", ["arrayLength", "malloc", "memcpy"]],
  ["arrayDelete", ["arrayLength"]],
  ["arraySetLength", ["arrayLength", "malloc", "memcpy"]],
  ["arrayHasOwnIndex", ["arrayLength"]],
  ["arrayPush", ["arraySet", "arrayLength"]],
  ["arrayPop", ["arrayLength"]],
  ["arrayShift", ["arrayLength"]],
  ["arrayUnshift", ["arraySetLength", "arrayLength"]],
  ["arrayKeys", ["arrayNew", "arraySet", "arrayHasOwnIndex", "valueBoxString", "indexToString", "objectKeys", "arrayConcat"]],
  ["arrayValues", ["arrayNew", "arraySet", "arrayHasOwnIndex", "objectValues", "arrayAppendElements"]],
  ["arrayOwnPropertyDescriptor", ["arrayHasOwnIndex", "arrayGet", "objectNew", "objectSet", "objectOwnPropertyDescriptor", "valueBoxObject"]],
  ["arrayLengthPropertyDescriptor", ["arrayLength", "objectNew", "objectSet", "valueBoxObject"]],
  ["arrayOwnPropertyDescriptors", ["arrayLength", "arrayHasOwnIndex", "arrayOwnPropertyDescriptor", "arrayLengthPropertyDescriptor", "indexToString", "objectNew", "objectSet", "objectOwnPropertyDescriptors", "objectAssign"]],
  ["arrayIncludes", ["arrayLength", "arrayHasOwnIndex", "valueStrictEquals", "valueStringLength", "valueStringPtr", "memcmp"]],
  ["arrayIndexOf", ["arrayLength", "arrayHasOwnIndex", "valueStrictEquals", "valueStringLength", "valueStringPtr", "memcmp"]],
  ["arrayLastIndexOf", ["arrayLength", "arrayHasOwnIndex", "arrayGet", "valueStrictEquals"]],
  ["arrayAt", ["arrayLength"]],
  ["arrayCopyWithin", ["arrayLength", "arrayHasOwnIndex", "arraySet", "arrayDelete"]],
  ["arraySlice", ["arrayLength", "arrayNew", "arrayHasOwnIndex", "arraySet"]],
  ["arrayJoin", ["arrayLength", "arrayHasOwnIndex", "valueToString", "malloc", "memcpy"]],
  ["arrayConcat", ["arrayLength", "arrayNew", "arrayHasOwnIndex", "arraySet", "arrayGet", "valueIsArray", "valueArrayPtr"]],
  ["arrayAppendElements", ["arrayLength", "arrayHasOwnIndex", "arrayGet", "arrayPush"]],
  ["arrayFill", ["arrayLength", "arraySet"]],
  ["arrayReverse", ["arrayLength"]],
  ["arrayHas", ["arrayHasOwnIndex", "objectHas", "objectHasOwn", "objectGetOwn", "memcmp"]],
  ["arrayGetPrototype", ["arrayLength"]],
  ["objectCreate", ["objectNew"]],
  ["objectGet", ["objectGetOwn"]],
  ["objectHasOwn", ["objectGetOwn"]],
  ["objectHas", ["objectHasOwn", "objectGetOwn", "memcmp"]],
  ["objectSetPrototype", ["objectWouldCreateCycle"]],
  ["objectKeys", ["arrayNew", "arraySet", "valueBoxString"]],
  ["objectValues", ["arrayNew", "arraySet"]],
  ["objectOwnPropertyDescriptor", ["objectNew", "objectSet", "valueBoxObject", "memcmp"]],
  ["objectPropertyIsEnumerable", ["memcmp"]],
  ["objectSeal", ["objectPreventExtensions"]],
  ["objectFreeze", ["objectPreventExtensions", "objectSeal"]],
  ["objectIsSealed", ["objectPreventExtensions", "objectIsExtensible"]],
  ["objectIsFrozen", ["objectPreventExtensions", "objectIsSealed"]],
  ["objectAssign", ["objectSet"]],
  ["objectAssignArray", ["arrayLength", "arrayHasOwnIndex", "arrayGet", "indexToString", "objectSet", "objectAssign"]],
  ["valueObjectAssign", ["valueObjectPtr", "valueArrayPtr", "objectAssign", "objectAssignArray"]],
  ["objectGetOwn", ["memcmp"]],
  ["objectSet", ["objectGet", "objectGetOwn", "memcmp", "malloc", "memcpy"]],
  ["objectDefineDataProperty", ["objectGet", "objectGetOwn", "memcmp", "malloc", "memcpy"]],
  ["objectDelete", ["memcmp"]]
]);

export function useRuntimeHelper(runtime: RuntimeHelperEmitter, helper: RuntimeHelper): void {
  if (runtime.used.has(helper)) {
    return;
  }
  runtime.used.add(helper);
  for (const dependency of runtimeHelperDependencies.get(helper) ?? []) {
    useRuntimeHelper(runtime, dependency);
  }
}

export function emitRuntimeDeclarations(runtime: RuntimeHelperEmitter): string[] {
  const declarations: string[] = [];
  const declarationByHelper = new Map<RuntimeHelper, string>([
    ["malloc", "declare ptr @malloc(i64)"],
    ["memcpy", "declare ptr @memcpy(ptr, ptr, i64)"],
    ["memcmp", "declare i32 @memcmp(ptr, ptr, i64)"],
    ["sprintf", "declare i32 @sprintf(ptr, ptr, ...)"]
  ]);

  for (const helper of ["malloc", "memcpy", "memcmp", "sprintf"] as const) {
    if (runtime.used.has(helper)) {
      const declaration = declarationByHelper.get(helper);
      if (declaration !== undefined) {
        declarations.push(declaration);
      }
    }
  }

  return declarations;
}

// eslint-disable-next-line complexity, max-statements -- Generated helper emission stays centralized during the runtime ABI transition.
export function emitRuntimeDefinitions(runtime: RuntimeHelperEmitter): string[] {
  const definitions: string[] = [];
  if (runtime.used.has("strConcat")) {
    definitions.push(`define ptr @strConcat(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr) {
entry:
  %total = add i64 %left.len, %right.len
  %alloc.size = add i64 %total, 1
  %out = call ptr @malloc(i64 %alloc.size)
  call ptr @memcpy(ptr %out, ptr %left.ptr, i64 %left.len)
  %right.dst = getelementptr i8, ptr %out, i64 %left.len
  call ptr @memcpy(ptr %right.dst, ptr %right.ptr, i64 %right.len)
  %nul.ptr = getelementptr i8, ptr %out, i64 %total
  store i8 0, ptr %nul.ptr
  ret ptr %out
}
`);
  }
  if (runtime.used.has("strEquals")) {
    definitions.push(`define i1 @strEquals(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr) {
entry:
  %same.len = icmp eq i64 %left.len, %right.len
  br i1 %same.len, label %compare, label %not.equal
compare:
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)
  %same.bytes = icmp eq i32 %cmp, 0
  br i1 %same.bytes, label %equal, label %not.equal
equal:
  ret i1 true
not.equal:
  ret i1 false
}
`);
  }
  if (runtime.used.has("valueStrictEquals")) {
    definitions.push(`define i1 @valueStrictEquals(i64 %left, i64 %right) {
entry:
  %same = icmp eq i64 %left, %right
  br i1 %same, label %equal, label %check.strings
check.strings:
  %left.tag = and i64 %left, -281474976710656
  %right.tag = and i64 %right, -281474976710656
  %left.string = icmp eq i64 %left.tag, 9221683186994511872
  %right.string = icmp eq i64 %right.tag, 9221683186994511872
  %both.strings = and i1 %left.string, %right.string
  br i1 %both.strings, label %string.compare, label %not.equal
string.compare:
  %left.len = call i64 @valueStringLength(i64 %left)
  %right.len = call i64 @valueStringLength(i64 %right)
  %same.len = icmp eq i64 %left.len, %right.len
  br i1 %same.len, label %string.bytes, label %not.equal
string.bytes:
  %left.ptr = call ptr @valueStringPtr(i64 %left)
  %right.ptr = call ptr @valueStringPtr(i64 %right)
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)
  %same.bytes = icmp eq i32 %cmp, 0
  br i1 %same.bytes, label %equal, label %not.equal
equal:
  ret i1 true
not.equal:
  ret i1 false
}
`);
  }
  if (runtime.used.has("valueBoxString")) {
    definitions.push(`define i64 @valueBoxString(ptr %string.ptr, i64 %string.len) {
entry:
  %box = call ptr @malloc(i64 16)
  store ptr %string.ptr, ptr %box
  %len.slot = getelementptr i8, ptr %box, i64 8
  store i64 %string.len, ptr %len.slot
  %box.bits = ptrtoint ptr %box to i64
  %payload = and i64 %box.bits, 281474976710655
  %value = or i64 %payload, 9221683186994511872
  ret i64 %value
}
`);
  }
  if (runtime.used.has("valueStringPtr")) {
    definitions.push(`define ptr @valueStringPtr(i64 %value) {
entry:
  %box.bits = and i64 %value, 281474976710655
  %box = inttoptr i64 %box.bits to ptr
  %ptr = load ptr, ptr %box
  ret ptr %ptr
}
`);
  }
  if (runtime.used.has("valueStringLength")) {
    definitions.push(`define i64 @valueStringLength(i64 %value) {
entry:
  %box.bits = and i64 %value, 281474976710655
  %box = inttoptr i64 %box.bits to ptr
  %len.slot = getelementptr i8, ptr %box, i64 8
  %len = load i64, ptr %len.slot
  ret i64 %len
}
`);
  }
  if (runtime.used.has("valueBoxObject")) {
    definitions.push(`define i64 @valueBoxObject(ptr %object) {
entry:
  %bits = ptrtoint ptr %object to i64
  %payload = and i64 %bits, 281474976710655
  %value = or i64 %payload, 9221120237041090560
  ret i64 %value
}
`);
  }
  if (runtime.used.has("valueBoxArray")) {
    definitions.push(`define i64 @valueBoxArray(ptr %array) {
entry:
  %bits = ptrtoint ptr %array to i64
  %payload = and i64 %bits, 281474976710655
  %value = or i64 %payload, 9221401712017801216
  ret i64 %value
}
`);
  }
  if (runtime.used.has("valueObjectPtr")) {
    definitions.push(`define ptr @valueObjectPtr(i64 %value) {
entry:
  %bits = and i64 %value, 281474976710655
  %ptr = inttoptr i64 %bits to ptr
  ret ptr %ptr
}
`);
  }
  if (runtime.used.has("valueArrayPtr")) {
    definitions.push(`define ptr @valueArrayPtr(i64 %value) {
entry:
  %bits = and i64 %value, 281474976710655
  %ptr = inttoptr i64 %bits to ptr
  ret ptr %ptr
}
`);
  }
  if (runtime.used.has("valueIsObject")) {
    definitions.push(`define i1 @valueIsObject(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  ret i1 %is.object
}
`);
  }
  if (runtime.used.has("valueIsArray")) {
    definitions.push(`define i1 @valueIsArray(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.array = icmp eq i64 %tag, 9221401712017801216
  ret i1 %is.array
}
`);
  }
  if (runtime.used.has("valueObjectGet")) {
    definitions.push(`define i64 @valueObjectGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %object = call ptr @valueObjectPtr(i64 %value)
  %result = call i64 @objectGet(ptr %object, i64 %key.len, ptr %key.ptr)
  ret i64 %result
}
`);
  }
  if (runtime.used.has("valueArrayGet")) {
    definitions.push(`define i64 @valueArrayGet(i64 %value, i64 %index, i64 %key.len, ptr %key.ptr) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  %result = call i64 @arrayGetWithKey(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr)
  ret i64 %result
}
`);
  }
  if (runtime.used.has("valueArrayLength")) {
    definitions.push(`define i64 @valueArrayLength(i64 %value) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  %length = call i64 @arrayLength(ptr %array)
  ret i64 %length
}
`);
  }
  if (runtime.used.has("valueObjectSet")) {
    definitions.push(`define void @valueObjectSet(i64 %value, i64 %key.len, ptr %key.ptr, i64 %stored) {
entry:
  %object = call ptr @valueObjectPtr(i64 %value)
  call void @objectSet(ptr %object, i64 %key.len, ptr %key.ptr, i64 %stored)
  ret void
}
`);
  }
  if (runtime.used.has("valueArraySet")) {
    definitions.push(`define void @valueArraySet(i64 %value, i64 %index, i64 %stored) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  call void @arraySet(ptr %array, i64 %index, i64 %stored)
  ret void
}
`);
  }
  if (runtime.used.has("valueArraySetLength")) {
    definitions.push(`define void @valueArraySetLength(i64 %value, i64 %length) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  call void @arraySetLength(ptr %array, i64 %length)
  ret void
}
`);
  }
  if (runtime.used.has("valueObjectDelete")) {
    definitions.push(`define void @valueObjectDelete(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %object = call ptr @valueObjectPtr(i64 %value)
  call void @objectDelete(ptr %object, i64 %key.len, ptr %key.ptr)
  ret void
}
`);
  }
  if (runtime.used.has("valueArrayDelete")) {
    definitions.push(`define void @valueArrayDelete(i64 %value, i64 %index) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  call void @arrayDelete(ptr %array, i64 %index)
  ret void
}
`);
  }
  if (runtime.used.has("valueObjectHasOwn")) {
    definitions.push(`define i1 @valueObjectHasOwn(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.has = call i1 @objectHasOwn(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret i1 %object.has
check.array:
  %is.array = icmp eq i64 %tag, 9221401712017801216
  br i1 %is.array, label %array, label %missing
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %empty.key = icmp eq i64 %key.len, 0
  br i1 %empty.key, label %missing, label %array.leading.zero
array.leading.zero:
  %first.byte = load i8, ptr %key.ptr
  %first.zero = icmp eq i8 %first.byte, 48
  %multi.char = icmp ugt i64 %key.len, 1
  %leading.zero = and i1 %first.zero, %multi.char
  br i1 %leading.zero, label %missing, label %array.parse
array.parse:
  br label %array.parse.loop
array.parse.loop:
  %parse.i = phi i64 [ 0, %array.parse ], [ %parse.next, %array.parse.advance ]
  %index = phi i64 [ 0, %array.parse ], [ %next.index, %array.parse.advance ]
  %parse.done = icmp eq i64 %parse.i, %key.len
  br i1 %parse.done, label %array.has.index, label %array.parse.digit
array.parse.digit:
  %char.ptr = getelementptr i8, ptr %key.ptr, i64 %parse.i
  %char = load i8, ptr %char.ptr
  %above.lower = icmp uge i8 %char, 48
  %below.upper = icmp ule i8 %char, 57
  %is.digit = and i1 %above.lower, %below.upper
  br i1 %is.digit, label %array.parse.advance, label %missing
array.parse.advance:
  %digit.i8 = sub i8 %char, 48
  %digit = zext i8 %digit.i8 to i64
  %shifted.index = mul i64 %index, 10
  %next.index = add i64 %shifted.index, %digit
  %parse.next = add i64 %parse.i, 1
  br label %array.parse.loop
array.has.index:
  %array.has = call i1 @arrayHasOwnIndex(ptr %array.ptr, i64 %index)
  ret i1 %array.has
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("valueObjectKeys")) {
    definitions.push(`define ptr @valueObjectKeys(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.keys = call ptr @objectKeys(ptr %object.ptr)
  ret ptr %object.keys
check.array:
  %is.array = icmp eq i64 %tag, 9221401712017801216
  br i1 %is.array, label %array, label %primitive
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.keys = call ptr @arrayKeys(ptr %array.ptr)
  ret ptr %array.keys
primitive:
  %empty = call ptr @arrayNew(i64 0)
  ret ptr %empty
}
`);
  }
  if (runtime.used.has("valueObjectValues")) {
    definitions.push(`define ptr @valueObjectValues(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.values = call ptr @objectValues(ptr %object.ptr)
  ret ptr %object.values
check.array:
  %is.array = icmp eq i64 %tag, 9221401712017801216
  br i1 %is.array, label %array, label %primitive
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.values = call ptr @arrayValues(ptr %array.ptr)
  ret ptr %array.values
primitive:
  %empty = call ptr @arrayNew(i64 0)
  ret ptr %empty
}
`);
  }
  if (runtime.used.has("valueObjectEntries")) {
    definitions.push(`define ptr @valueObjectEntries(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.entries = call ptr @objectEntries(ptr %object.ptr)
  ret ptr %object.entries
check.array:
  %is.array = icmp eq i64 %tag, 9221401712017801216
  br i1 %is.array, label %array, label %primitive
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.entries = call ptr @arrayEntries(ptr %array.ptr)
  ret ptr %array.entries
primitive:
  %empty = call ptr @arrayNew(i64 0)
  ret ptr %empty
}
`);
  }
  if (runtime.used.has("valueObjectOwnPropertyDescriptor")) {
    definitions.push(`@.value.desc.length = private unnamed_addr constant [7 x i8] c"length\\00"

define i64 @valueObjectOwnPropertyDescriptor(i64 %value, i64 %key.len, ptr %key.ptr, i64 %index, i1 %is.length) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.desc = call i64 @objectOwnPropertyDescriptor(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret i64 %object.desc
check.array:
  %is.array = icmp eq i64 %tag, 9221401712017801216
  br i1 %is.array, label %array, label %primitive
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  br i1 %is.length, label %array.length, label %array.index
array.length:
  %length.desc = call i64 @arrayLengthPropertyDescriptor(ptr %array.ptr)
  ret i64 %length.desc
array.index:
  %array.desc = call i64 @arrayOwnPropertyDescriptor(ptr %array.ptr, i64 %key.len, ptr %key.ptr, i64 %index)
  ret i64 %array.desc
primitive:
  ret i64 9222246136947933184
}
`);
  }
  if (runtime.used.has("valueObjectOwnPropertyNames")) {
    definitions.push(`define ptr @valueObjectOwnPropertyNames(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.names = call ptr @objectOwnPropertyNames(ptr %object.ptr)
  ret ptr %object.names
check.array:
  %is.array = icmp eq i64 %tag, 9221401712017801216
  br i1 %is.array, label %array, label %primitive
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.names = call ptr @arrayOwnPropertyNames(ptr %array.ptr)
  ret ptr %array.names
primitive:
  %empty = call ptr @arrayNew(i64 0)
  ret ptr %empty
}
`);
  }
  if (runtime.used.has("valueObjectOwnPropertyDescriptors")) {
    definitions.push(`define ptr @valueObjectOwnPropertyDescriptors(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.descriptors = call ptr @objectOwnPropertyDescriptors(ptr %object.ptr)
  ret ptr %object.descriptors
check.array:
  %is.array = icmp eq i64 %tag, 9221401712017801216
  br i1 %is.array, label %array, label %empty
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.descriptors = call ptr @arrayOwnPropertyDescriptors(ptr %array.ptr)
  ret ptr %array.descriptors
empty:
  %empty.descriptors = call ptr @objectNew(i64 0)
  ret ptr %empty.descriptors
}
`);
  }
  if (runtime.used.has("valueTruthy")) {
    definitions.push(`define i1 @valueTruthy(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %false, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %false, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %true, label %check.string
check.string:
  %tagged = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged, 9221683186994511872
  br i1 %is.string, label %string, label %number.block
string:
  %len = call i64 @valueStringLength(i64 %value)
  %nonempty = icmp ne i64 %len, 0
  ret i1 %nonempty
number.block:
  %number.value = bitcast i64 %value to double
  %nonzero = fcmp one double %number.value, 0.0
  ret i1 %nonzero
true:
  ret i1 true
false:
  ret i1 false
}
`);
  }
  if (runtime.used.has("valuePrint")) {
    definitions.push(`@.value.fmt.number = private unnamed_addr constant [4 x i8] c"%g\\0A\\00"
@.value.true = private unnamed_addr constant [5 x i8] c"true\\00"
@.value.false = private unnamed_addr constant [6 x i8] c"false\\00"
@.value.undefined = private unnamed_addr constant [10 x i8] c"undefined\\00"
@.value.null = private unnamed_addr constant [5 x i8] c"null\\00"
@.value.object = private unnamed_addr constant [16 x i8] c"[object Object]\\00"
@.value.array = private unnamed_addr constant [15 x i8] c"[object Array]\\00"

define void @valuePrint(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %print.undefined, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %print.false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %print.true, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %print.null, label %check.object
check.object:
  %tagged.object = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tagged.object, 9221120237041090560
  br i1 %is.object, label %print.object, label %check.array
check.array:
  %tagged.array = and i64 %value, -281474976710656
  %is.array = icmp eq i64 %tagged.array, 9221401712017801216
  br i1 %is.array, label %print.array, label %check.string
check.string:
  %tagged = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged, 9221683186994511872
  br i1 %is.string, label %print.string, label %print.number
print.undefined:
  call i32 @puts(ptr @.value.undefined)
  ret void
print.false:
  call i32 @puts(ptr @.value.false)
  ret void
print.true:
  call i32 @puts(ptr @.value.true)
  ret void
print.null:
  call i32 @puts(ptr @.value.null)
  ret void
print.object:
  call i32 @puts(ptr @.value.object)
  ret void
print.array:
  call i32 @puts(ptr @.value.array)
  ret void
print.string:
  %ptr = call ptr @valueStringPtr(i64 %value)
  call i32 @puts(ptr %ptr)
  ret void
print.number:
  %number = bitcast i64 %value to double
  call i32 (ptr, ...) @printf(ptr @.value.fmt.number, double %number)
  ret void
}
`);
  }
  if (runtime.used.has("valueToString")) {
    definitions.push(`@.tostring.fmt.number = private unnamed_addr constant [3 x i8] c"%g\\00"
@.tostring.true = private unnamed_addr constant [5 x i8] c"true\\00"
@.tostring.false = private unnamed_addr constant [6 x i8] c"false\\00"
@.tostring.undefined = private unnamed_addr constant [10 x i8] c"undefined\\00"
@.tostring.null = private unnamed_addr constant [5 x i8] c"null\\00"
@.tostring.object = private unnamed_addr constant [16 x i8] c"[object Object]\\00"
@.tostring.array = private unnamed_addr constant [15 x i8] c"[object Array]\\00"
@.tostring.comma = private unnamed_addr constant [2 x i8] c",\\00"

define { ptr, i64 } @valueToString(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %undefined, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %true, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %null, label %check.object
check.object:
  %tagged.object = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tagged.object, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
check.array:
  %tagged.array = and i64 %value, -281474976710656
  %is.array = icmp eq i64 %tagged.array, 9221401712017801216
  br i1 %is.array, label %array, label %check.string
check.string:
  %tagged.string = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged.string, 9221683186994511872
  br i1 %is.string, label %string, label %number
undefined:
  %undefined.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.undefined, 0
  %undefined.1 = insertvalue { ptr, i64 } %undefined.0, i64 9, 1
  ret { ptr, i64 } %undefined.1
false:
  %false.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.false, 0
  %false.1 = insertvalue { ptr, i64 } %false.0, i64 5, 1
  ret { ptr, i64 } %false.1
true:
  %true.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.true, 0
  %true.1 = insertvalue { ptr, i64 } %true.0, i64 4, 1
  ret { ptr, i64 } %true.1
null:
  %null.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.null, 0
  %null.1 = insertvalue { ptr, i64 } %null.0, i64 4, 1
  ret { ptr, i64 } %null.1
object:
  %object.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.object, 0
  %object.1 = insertvalue { ptr, i64 } %object.0, i64 15, 1
  ret { ptr, i64 } %object.1
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %joined = call ptr @arrayJoin(ptr %array.ptr, i64 1, ptr @.tostring.comma)
  br label %array.len.scan
array.len.scan:
  %array.len = phi i64 [ 0, %array ], [ %array.len.next, %array.len.more ]
  %array.char = getelementptr i8, ptr %joined, i64 %array.len
  %array.byte = load i8, ptr %array.char
  %array.done = icmp eq i8 %array.byte, 0
  br i1 %array.done, label %array.ret, label %array.len.more
array.len.more:
  %array.len.next = add i64 %array.len, 1
  br label %array.len.scan
array.ret:
  %array.0 = insertvalue { ptr, i64 } undef, ptr %joined, 0
  %array.1 = insertvalue { ptr, i64 } %array.0, i64 %array.len, 1
  ret { ptr, i64 } %array.1
string:
  %string.ptr = call ptr @valueStringPtr(i64 %value)
  %string.len = call i64 @valueStringLength(i64 %value)
  %string.0 = insertvalue { ptr, i64 } undef, ptr %string.ptr, 0
  %string.1 = insertvalue { ptr, i64 } %string.0, i64 %string.len, 1
  ret { ptr, i64 } %string.1
number:
  %number.ptr = call ptr @malloc(i64 32)
  %number.value = bitcast i64 %value to double
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %number.ptr, ptr @.tostring.fmt.number, double %number.value)
  %number.len = sext i32 %written to i64
  %number.0 = insertvalue { ptr, i64 } undef, ptr %number.ptr, 0
  %number.1 = insertvalue { ptr, i64 } %number.0, i64 %number.len, 1
  ret { ptr, i64 } %number.1
}
`);
  }
  if (runtime.used.has("arrayNew")) {
    definitions.push(`define ptr @arrayNew(i64 %length) {
entry:
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %capacity.empty, label %capacity.initial
capacity.empty:
  br label %alloc
capacity.initial:
  br label %alloc
alloc:
  %capacity = phi i64 [ 1, %capacity.empty ], [ %length, %capacity.initial ]
  %array = call ptr @malloc(i64 40)
  %properties = call ptr @objectNew(i64 0)
  %payload.bytes = mul i64 %capacity, 8
  %elements = call ptr @malloc(i64 %payload.bytes)
  store i64 %length, ptr %array
  %capacity.slot = getelementptr i8, ptr %array, i64 8
  store i64 %capacity, ptr %capacity.slot
  %elements.slot = getelementptr i8, ptr %array, i64 16
  store ptr %elements, ptr %elements.slot
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  store ptr null, ptr %prototype.slot
  %properties.slot = getelementptr i8, ptr %array, i64 32
  store ptr %properties, ptr %properties.slot
  br label %fill.cond
fill.cond:
  %i = phi i64 [ 0, %alloc ], [ %next, %fill.body ]
  %done = icmp eq i64 %i, %capacity
  br i1 %done, label %exit, label %fill.body
fill.body:
  %slot.bytes = mul i64 %i, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  store i64 9222246136947933191, ptr %slot
  %next = add i64 %i, 1
  br label %fill.cond
exit:
  ret ptr %array
}
`);
  }
  if (runtime.used.has("arrayLength")) {
    definitions.push(`define i64 @arrayLength(ptr %array) {
entry:
  %length = load i64, ptr %array
  ret i64 %length
}
`);
  }
  if (runtime.used.has("arrayGet")) {
    definitions.push(`define i64 @arrayGet(ptr %array, i64 %index) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %in.bounds = icmp ult i64 %index, %length
  br i1 %in.bounds, label %load, label %missing
load:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  %is.hole = icmp eq i64 %value, 9222246136947933191
  br i1 %is.hole, label %missing, label %found
found:
  ret i64 %value
missing:
  ret i64 9222246136947933184
}
`);
  }
  if (runtime.used.has("arrayGetWithKey")) {
    definitions.push(`define i64 @arrayGetWithKey(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr) {
entry:
  %has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %index)
  br i1 %has.own, label %own, label %check.prototype
own:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  ret i64 %value
check.prototype:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named = call i64 @objectGet(ptr %properties, i64 %key.len, ptr %key.ptr)
  %has.named = icmp ne i64 %named, 9222246136947933184
  br i1 %has.named, label %array.named, label %prototype.check
array.named:
  ret i64 %named
prototype.check:
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  %prototype = load ptr, ptr %prototype.slot
  %has.prototype = icmp ne ptr %prototype, null
  br i1 %has.prototype, label %prototype.lookup, label %missing
prototype.lookup:
  %prototype.value = call i64 @objectGet(ptr %prototype, i64 %key.len, ptr %key.ptr)
  ret i64 %prototype.value
missing:
  ret i64 9222246136947933184
}
`);
  }
  if (runtime.used.has("arraySetNamed")) {
    definitions.push(`define void @arraySetNamed(ptr %array, i64 %key.len, ptr %key.ptr, i64 %value) {
entry:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  call void @objectSet(ptr %properties, i64 %key.len, ptr %key.ptr, i64 %value)
  ret void
}
`);
  }
  if (runtime.used.has("arrayDeleteNamed")) {
    definitions.push(`define void @arrayDeleteNamed(ptr %array, i64 %key.len, ptr %key.ptr) {
entry:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  call void @objectDelete(ptr %properties, i64 %key.len, ptr %key.ptr)
  ret void
}
`);
  }
  if (runtime.used.has("arrayHasOwnIndex")) {
    definitions.push(`define i1 @arrayHasOwnIndex(ptr %array, i64 %index) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %in.bounds = icmp ult i64 %index, %length
  br i1 %in.bounds, label %load, label %missing
load:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  %is.hole = icmp eq i64 %value, 9222246136947933191
  br i1 %is.hole, label %missing, label %found
found:
  ret i1 true
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("arraySet")) {
    definitions.push(`define void @arraySet(ptr %array, i64 %index, i64 %value) {
entry:
  %length = load i64, ptr %array
  %capacity.slot = getelementptr i8, ptr %array, i64 8
  %capacity = load i64, ptr %capacity.slot
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %extends = icmp uge i64 %index, %length
  br i1 %extends, label %ensure.capacity, label %store.existing
store.existing:
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  store i64 %value, ptr %slot
  ret void
ensure.capacity:
  %next.length = add i64 %index, 1
  %has.capacity = icmp ult i64 %index, %capacity
  br i1 %has.capacity, label %fill.gap, label %grow
grow:
  %double.capacity = mul i64 %capacity, 2
  %needs.target.capacity = icmp ult i64 %double.capacity, %next.length
  %new.capacity = select i1 %needs.target.capacity, i64 %next.length, i64 %double.capacity
  %new.elements.bytes = mul i64 %new.capacity, 8
  %new.elements = call ptr @malloc(i64 %new.elements.bytes)
  %old.elements.bytes = mul i64 %length, 8
  call ptr @memcpy(ptr %new.elements, ptr %elements, i64 %old.elements.bytes)
  store i64 %new.capacity, ptr %capacity.slot
  store ptr %new.elements, ptr %elements.slot
  br label %fill.gap
fill.gap:
  %active.elements = phi ptr [ %elements, %ensure.capacity ], [ %new.elements, %grow ]
  br label %fill.cond
fill.cond:
  %i = phi i64 [ %length, %fill.gap ], [ %gap.next, %fill.body ]
  %gap.done = icmp eq i64 %i, %index
  br i1 %gap.done, label %store.grown, label %fill.body
fill.body:
  %gap.slot.bytes = mul i64 %i, 8
  %gap.slot = getelementptr i8, ptr %active.elements, i64 %gap.slot.bytes
  store i64 9222246136947933191, ptr %gap.slot
  %gap.next = add i64 %i, 1
  br label %fill.cond
store.grown:
  %grown.slot.bytes = mul i64 %index, 8
  %grown.slot = getelementptr i8, ptr %active.elements, i64 %grown.slot.bytes
  store i64 %value, ptr %grown.slot
  store i64 %next.length, ptr %array
  ret void
}
`);
  }
  if (runtime.used.has("arrayDelete")) {
    definitions.push(`define void @arrayDelete(ptr %array, i64 %index) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %in.bounds = icmp ult i64 %index, %length
  br i1 %in.bounds, label %delete, label %exit
delete:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  store i64 9222246136947933191, ptr %slot
  ret void
exit:
  ret void
}
`);
  }
  if (runtime.used.has("arraySetLength")) {
    definitions.push(`define void @arraySetLength(ptr %array, i64 %new.length) {
entry:
  %old.length = load i64, ptr %array
  %capacity.slot = getelementptr i8, ptr %array, i64 8
  %capacity = load i64, ptr %capacity.slot
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %grows = icmp ugt i64 %new.length, %old.length
  br i1 %grows, label %ensure.capacity, label %shrink.fill
ensure.capacity:
  %has.capacity = icmp ule i64 %new.length, %capacity
  br i1 %has.capacity, label %grow.fill, label %grow
grow:
  %double.capacity = mul i64 %capacity, 2
  %needs.target.capacity = icmp ult i64 %double.capacity, %new.length
  %new.capacity = select i1 %needs.target.capacity, i64 %new.length, i64 %double.capacity
  %new.elements.bytes = mul i64 %new.capacity, 8
  %new.elements = call ptr @malloc(i64 %new.elements.bytes)
  %old.elements.bytes = mul i64 %old.length, 8
  call ptr @memcpy(ptr %new.elements, ptr %elements, i64 %old.elements.bytes)
  store i64 %new.capacity, ptr %capacity.slot
  store ptr %new.elements, ptr %elements.slot
  br label %grow.fill
grow.fill:
  %grow.elements = phi ptr [ %elements, %ensure.capacity ], [ %new.elements, %grow ]
  br label %grow.fill.cond
grow.fill.cond:
  %grow.i = phi i64 [ %old.length, %grow.fill ], [ %grow.next, %grow.fill.body ]
  %grow.done = icmp eq i64 %grow.i, %new.length
  br i1 %grow.done, label %store.length, label %grow.fill.body
grow.fill.body:
  %grow.slot.bytes = mul i64 %grow.i, 8
  %grow.slot = getelementptr i8, ptr %grow.elements, i64 %grow.slot.bytes
  store i64 9222246136947933191, ptr %grow.slot
  %grow.next = add i64 %grow.i, 1
  br label %grow.fill.cond
shrink.fill:
  br label %shrink.fill.cond
shrink.fill.cond:
  %shrink.i = phi i64 [ %new.length, %shrink.fill ], [ %shrink.next, %shrink.fill.body ]
  %shrink.done = icmp eq i64 %shrink.i, %old.length
  br i1 %shrink.done, label %store.length, label %shrink.fill.body
shrink.fill.body:
  %shrink.slot.bytes = mul i64 %shrink.i, 8
  %shrink.slot = getelementptr i8, ptr %elements, i64 %shrink.slot.bytes
  store i64 9222246136947933191, ptr %shrink.slot
  %shrink.next = add i64 %shrink.i, 1
  br label %shrink.fill.cond
store.length:
  store i64 %new.length, ptr %array
  ret void
}
`);
  }
  if (runtime.used.has("indexToString")) {
    definitions.push(`define ptr @indexToString(i64 %index) {
entry:
  br label %count.loop
count.loop:
  %count.value = phi i64 [ %index, %entry ], [ %count.next.value, %count.more ]
  %digits = phi i64 [ 1, %entry ], [ %digits.next, %count.more ]
  %count.more.check = icmp uge i64 %count.value, 10
  br i1 %count.more.check, label %count.more, label %alloc
count.more:
  %count.next.value = udiv i64 %count.value, 10
  %digits.next = add i64 %digits, 1
  br label %count.loop
alloc:
  %alloc.size = add i64 %digits, 1
  %out = call ptr @malloc(i64 %alloc.size)
  %nul = getelementptr i8, ptr %out, i64 %digits
  store i8 0, ptr %nul
  br label %fill.loop
fill.loop:
  %fill.value = phi i64 [ %index, %alloc ], [ %fill.next.value, %fill.body ]
  %pos = phi i64 [ %digits, %alloc ], [ %next.pos, %fill.body ]
  %done = icmp eq i64 %pos, 0
  br i1 %done, label %exit, label %fill.body
fill.body:
  %next.pos = sub i64 %pos, 1
  %quotient = udiv i64 %fill.value, 10
  %q10 = mul i64 %quotient, 10
  %remainder = sub i64 %fill.value, %q10
  %digit = add i64 %remainder, 48
  %byte = trunc i64 %digit to i8
  %slot = getelementptr i8, ptr %out, i64 %next.pos
  store i8 %byte, ptr %slot
  %fill.next.value = udiv i64 %fill.value, 10
  br label %fill.loop
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayHas")) {
    definitions.push(`define i1 @arrayHas(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr) {
entry:
  %own = call i1 @arrayHasOwnIndex(ptr %array, i64 %index)
  br i1 %own, label %found, label %check.prototype
found:
  ret i1 true
check.prototype:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.own = call i1 @objectHasOwn(ptr %properties, i64 %key.len, ptr %key.ptr)
  br i1 %named.own, label %found, label %prototype.check
prototype.check:
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  %prototype = load ptr, ptr %prototype.slot
  %has.prototype = icmp ne ptr %prototype, null
  br i1 %has.prototype, label %prototype.lookup, label %missing
prototype.lookup:
  %prototype.has = call i1 @objectHas(ptr %prototype, i64 %key.len, ptr %key.ptr)
  ret i1 %prototype.has
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("arrayKeys")) {
    definitions.push(`define ptr @arrayKeys(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %key.count = phi i64 [ 0, %entry ], [ %key.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %length
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %count.i)
  br i1 %has.own, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %key.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %key.count.next = phi i64 [ %included.count, %count.include ], [ %key.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %out = call ptr @arrayNew(i64 %key.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %length
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %fill.i)
  br i1 %fill.has.own, label %fill.include, label %fill.skip
fill.include:
  %key.ptr = call ptr @indexToString(i64 %fill.i)
  br label %digit.count
digit.count:
  %digit.value = phi i64 [ %fill.i, %fill.include ], [ %digit.next.value, %digit.more ]
  %digit.len = phi i64 [ 1, %fill.include ], [ %digit.len.next, %digit.more ]
  %digit.more.check = icmp uge i64 %digit.value, 10
  br i1 %digit.more.check, label %digit.more, label %box.key
digit.more:
  %digit.next.value = udiv i64 %digit.value, 10
  %digit.len.next = add i64 %digit.len, 1
  br label %digit.count
box.key:
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %digit.len)
  call void @arraySet(ptr %out, i64 %out.i, i64 %key.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %box.key ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.keys = call ptr @objectKeys(ptr %properties)
  %combined = call ptr @arrayConcat(ptr %out, ptr %named.keys)
  ret ptr %combined
}
`);
  }
  if (runtime.used.has("arrayValues")) {
    definitions.push(`define ptr @arrayValues(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %value.count = phi i64 [ 0, %entry ], [ %value.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %length
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %count.i)
  br i1 %has.own, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %value.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %value.count.next = phi i64 [ %included.count, %count.include ], [ %value.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %out = call ptr @arrayNew(i64 %value.count)
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %length
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %fill.i)
  br i1 %fill.has.own, label %fill.include, label %fill.skip
fill.include:
  %slot.bytes = mul i64 %fill.i, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  call void @arraySet(ptr %out, i64 %out.i, i64 %value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %fill.include ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.values = call ptr @objectValues(ptr %properties)
  call void @arrayAppendElements(ptr %out, ptr %named.values)
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayEntries")) {
    definitions.push(`define ptr @arrayEntries(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %entry.count = phi i64 [ 0, %entry ], [ %entry.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %length
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %count.i)
  br i1 %has.own, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %entry.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %entry.count.next = phi i64 [ %included.count, %count.include ], [ %entry.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %out = call ptr @arrayNew(i64 %entry.count)
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %length
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %fill.i)
  br i1 %fill.has.own, label %fill.include, label %fill.skip
fill.include:
  %pair = call ptr @arrayNew(i64 2)
  %key.ptr = call ptr @indexToString(i64 %fill.i)
  br label %digit.count
digit.count:
  %digit.value = phi i64 [ %fill.i, %fill.include ], [ %digit.next.value, %digit.more ]
  %digit.len = phi i64 [ 1, %fill.include ], [ %digit.len.next, %digit.more ]
  %digit.more.check = icmp uge i64 %digit.value, 10
  br i1 %digit.more.check, label %digit.more, label %box.key
digit.more:
  %digit.next.value = udiv i64 %digit.value, 10
  %digit.len.next = add i64 %digit.len, 1
  br label %digit.count
box.key:
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %digit.len)
  %slot.bytes = mul i64 %fill.i, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  call void @arraySet(ptr %pair, i64 0, i64 %key.value)
  call void @arraySet(ptr %pair, i64 1, i64 %value)
  %pair.value = call i64 @valueBoxArray(ptr %pair)
  call void @arraySet(ptr %out, i64 %out.i, i64 %pair.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %box.key ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.entries = call ptr @objectEntries(ptr %properties)
  call void @arrayAppendElements(ptr %out, ptr %named.entries)
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayOwnPropertyDescriptor")) {
    definitions.push(`define i64 @arrayOwnPropertyDescriptor(ptr %array, i64 %key.len, ptr %key.ptr, i64 %index) {
entry:
  %is.index = icmp sge i64 %index, 0
  br i1 %is.index, label %check.index, label %named
check.index:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %index)
  br i1 %has, label %present, label %named
present:
  %value = call i64 @arrayGet(ptr %array, i64 %index)
  %desc = call ptr @objectNew(i64 4)
  call void @objectSet(ptr %desc, i64 5, ptr @.desc.value, i64 %value)
  call void @objectSet(ptr %desc, i64 8, ptr @.desc.writable, i64 9222246136947933186)
  call void @objectSet(ptr %desc, i64 10, ptr @.desc.enumerable, i64 9222246136947933186)
  call void @objectSet(ptr %desc, i64 12, ptr @.desc.configurable, i64 9222246136947933186)
  %boxed = call i64 @valueBoxObject(ptr %desc)
  ret i64 %boxed
named:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.desc = call i64 @objectOwnPropertyDescriptor(ptr %properties, i64 %key.len, ptr %key.ptr)
  ret i64 %named.desc
}
`);
  }
  if (runtime.used.has("arrayLengthPropertyDescriptor")) {
    definitions.push(`define i64 @arrayLengthPropertyDescriptor(ptr %array) {
entry:
  %length.i = call i64 @arrayLength(ptr %array)
  %length = uitofp i64 %length.i to double
  %length.value = bitcast double %length to i64
  %desc = call ptr @objectNew(i64 4)
  call void @objectSet(ptr %desc, i64 5, ptr @.desc.value, i64 %length.value)
  call void @objectSet(ptr %desc, i64 8, ptr @.desc.writable, i64 9222246136947933186)
  call void @objectSet(ptr %desc, i64 10, ptr @.desc.enumerable, i64 9222246136947933185)
  call void @objectSet(ptr %desc, i64 12, ptr @.desc.configurable, i64 9222246136947933185)
  %boxed = call i64 @valueBoxObject(ptr %desc)
  ret i64 %boxed
}
`);
  }
  if (runtime.used.has("arrayOwnPropertyDescriptors")) {
    definitions.push(`@.array.desc.length = private unnamed_addr constant [7 x i8] c"length\\00"

define ptr @arrayOwnPropertyDescriptors(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %out = call ptr @objectNew(i64 0)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %length.desc, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %i)
  br i1 %has, label %copy, label %advance
copy:
  %key = call ptr @indexToString(i64 %i)
  %desc = call i64 @arrayOwnPropertyDescriptor(ptr %array, i64 1, ptr %key, i64 %i)
  call void @objectSet(ptr %out, i64 1, ptr %key, i64 %desc)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
length.desc:
  %length.desc.value = call i64 @arrayLengthPropertyDescriptor(ptr %array)
  call void @objectSet(ptr %out, i64 6, ptr @.array.desc.length, i64 %length.desc.value)
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.descriptors = call ptr @objectOwnPropertyDescriptors(ptr %properties)
  call void @objectAssign(ptr %out, ptr %named.descriptors)
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayIncludes")) {
    definitions.push(`define i1 @arrayIncludes(ptr %array, i64 %needle) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %i)
  br i1 %has, label %load, label %hole
load:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %i, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  br label %compare
hole:
  br label %compare
compare:
  %candidate = phi i64 [ %value, %load ], [ 9222246136947933184, %hole ]
  %same = call i1 @valueStrictEquals(i64 %candidate, i64 %needle)
  br i1 %same, label %found, label %string.check
string.check:
  %candidate.tag = and i64 %candidate, -281474976710656
  %needle.tag = and i64 %needle, -281474976710656
  %candidate.string = icmp eq i64 %candidate.tag, 9221683186994511872
  %needle.string = icmp eq i64 %needle.tag, 9221683186994511872
  %both.strings = and i1 %candidate.string, %needle.string
  br i1 %both.strings, label %string.compare, label %advance
string.compare:
  %candidate.len = call i64 @valueStringLength(i64 %candidate)
  %needle.len = call i64 @valueStringLength(i64 %needle)
  %same.len = icmp eq i64 %candidate.len, %needle.len
  br i1 %same.len, label %string.bytes, label %advance
string.bytes:
  %candidate.ptr = call ptr @valueStringPtr(i64 %candidate)
  %needle.ptr = call ptr @valueStringPtr(i64 %needle)
  %string.cmp = call i32 @memcmp(ptr %candidate.ptr, ptr %needle.ptr, i64 %candidate.len)
  %same.string = icmp eq i32 %string.cmp, 0
  br i1 %same.string, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
found:
  ret i1 true
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("arrayIndexOf")) {
    definitions.push(`define i64 @arrayIndexOf(ptr %array, i64 %needle) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %i)
  br i1 %has, label %load, label %advance
load:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %i, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  %same = call i1 @valueStrictEquals(i64 %value, i64 %needle)
  br i1 %same, label %found, label %string.check
string.check:
  %value.tag = and i64 %value, -281474976710656
  %needle.tag = and i64 %needle, -281474976710656
  %value.string = icmp eq i64 %value.tag, 9221683186994511872
  %needle.string = icmp eq i64 %needle.tag, 9221683186994511872
  %both.strings = and i1 %value.string, %needle.string
  br i1 %both.strings, label %string.compare, label %advance
string.compare:
  %value.len = call i64 @valueStringLength(i64 %value)
  %needle.len = call i64 @valueStringLength(i64 %needle)
  %same.len = icmp eq i64 %value.len, %needle.len
  br i1 %same.len, label %string.bytes, label %advance
string.bytes:
  %value.ptr = call ptr @valueStringPtr(i64 %value)
  %needle.ptr = call ptr @valueStringPtr(i64 %needle)
  %string.cmp = call i32 @memcmp(ptr %value.ptr, ptr %needle.ptr, i64 %value.len)
  %same.string = icmp eq i32 %string.cmp, 0
  br i1 %same.string, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
found:
  ret i64 %i
missing:
  ret i64 -1
}
`);
  }
  if (runtime.used.has("arrayLastIndexOf")) {
    definitions.push(`define i64 @arrayLastIndexOf(ptr %array, i64 %needle) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %scan
scan:
  %i = phi i64 [ %length, %entry ], [ %prev, %advance ]
  %done = icmp eq i64 %i, 0
  br i1 %done, label %missing, label %check
check:
  %index = sub i64 %i, 1
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %index)
  br i1 %has, label %load, label %advance
load:
  %value = call i64 @arrayGet(ptr %array, i64 %index)
  %same = call i1 @valueStrictEquals(i64 %value, i64 %needle)
  br i1 %same, label %found, label %advance
advance:
  %prev = sub i64 %i, 1
  br label %scan
found:
  ret i64 %index
missing:
  ret i64 -1
}
`);
  }
  if (runtime.used.has("arrayAt")) {
    definitions.push(`define i64 @arrayAt(ptr %array, i64 %index) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %negative = icmp slt i64 %index, 0
  %from.end = add i64 %length, %index
  %actual = select i1 %negative, i64 %from.end, i64 %index
  %below.zero = icmp slt i64 %actual, 0
  br i1 %below.zero, label %missing, label %load
load:
  %in.bounds = icmp ult i64 %actual, %length
  br i1 %in.bounds, label %load.slot, label %missing
load.slot:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %actual, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %stored = load i64, ptr %slot
  %is.hole = icmp eq i64 %stored, 9222246136947933191
  br i1 %is.hole, label %missing, label %found
found:
  ret i64 %stored
missing:
  ret i64 9222246136947933184
}
`);
  }
  if (runtime.used.has("arrayCopyWithin")) {
    definitions.push(`define void @arrayCopyWithin(ptr %array, i64 %target, i64 %start, i64 %end) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %target.negative = icmp slt i64 %target, 0
  %target.from.end = add i64 %length, %target
  %target.normalized = select i1 %target.negative, i64 %target.from.end, i64 %target
  %target.low = icmp slt i64 %target.normalized, 0
  %target.clamped.low = select i1 %target.low, i64 0, i64 %target.normalized
  %target.high = icmp sgt i64 %target.clamped.low, %length
  %to = select i1 %target.high, i64 %length, i64 %target.clamped.low
  %start.negative = icmp slt i64 %start, 0
  %start.from.end = add i64 %length, %start
  %start.normalized = select i1 %start.negative, i64 %start.from.end, i64 %start
  %start.low = icmp slt i64 %start.normalized, 0
  %start.clamped.low = select i1 %start.low, i64 0, i64 %start.normalized
  %start.high = icmp sgt i64 %start.clamped.low, %length
  %from = select i1 %start.high, i64 %length, i64 %start.clamped.low
  %end.negative = icmp slt i64 %end, 0
  %end.from.end = add i64 %length, %end
  %end.normalized = select i1 %end.negative, i64 %end.from.end, i64 %end
  %end.low = icmp slt i64 %end.normalized, 0
  %end.clamped.low = select i1 %end.low, i64 0, i64 %end.normalized
  %end.high = icmp sgt i64 %end.clamped.low, %length
  %final = select i1 %end.high, i64 %length, i64 %end.clamped.low
  %available = sub i64 %final, %from
  %available.negative = icmp slt i64 %available, 0
  %positive.available = select i1 %available.negative, i64 0, i64 %available
  %room = sub i64 %length, %to
  %room.less = icmp slt i64 %room, %positive.available
  %count = select i1 %room.less, i64 %room, i64 %positive.available
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %source.end = add i64 %from, %count
  %target.after.source.start = icmp sgt i64 %to, %from
  %target.before.source.end = icmp slt i64 %to, %source.end
  %copy.backward = and i1 %target.after.source.start, %target.before.source.end
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %copy
copy:
  %reverse.base = sub i64 %count, 1
  %reverse.offset = sub i64 %reverse.base, %i
  %offset = select i1 %copy.backward, i64 %reverse.offset, i64 %i
  %from.index = add i64 %from, %offset
  %to.index = add i64 %to, %offset
  %from.has = call i1 @arrayHasOwnIndex(ptr %array, i64 %from.index)
  br i1 %from.has, label %copy.present, label %copy.hole
copy.present:
  %from.bytes = mul i64 %from.index, 8
  %from.ptr = getelementptr i8, ptr %elements, i64 %from.bytes
  %value = load i64, ptr %from.ptr
  call void @arraySet(ptr %array, i64 %to.index, i64 %value)
  br label %advance
copy.hole:
  call void @arrayDelete(ptr %array, i64 %to.index)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("arraySlice")) {
    definitions.push(`define ptr @arraySlice(ptr %array, i64 %start, i64 %end) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %start.negative = icmp slt i64 %start, 0
  %start.from.end = add i64 %length, %start
  %start.normalized = select i1 %start.negative, i64 %start.from.end, i64 %start
  %start.low = icmp slt i64 %start.normalized, 0
  %start.clamped.low = select i1 %start.low, i64 0, i64 %start.normalized
  %start.high = icmp sgt i64 %start.clamped.low, %length
  %from = select i1 %start.high, i64 %length, i64 %start.clamped.low
  %end.negative = icmp slt i64 %end, 0
  %end.from.end = add i64 %length, %end
  %end.normalized = select i1 %end.negative, i64 %end.from.end, i64 %end
  %end.low = icmp slt i64 %end.normalized, 0
  %end.clamped.low = select i1 %end.low, i64 0, i64 %end.normalized
  %end.high = icmp sgt i64 %end.clamped.low, %length
  %final = select i1 %end.high, i64 %length, i64 %end.clamped.low
  %raw.out.length = sub i64 %final, %from
  %empty.range = icmp slt i64 %raw.out.length, 0
  %out.length = select i1 %empty.range, i64 0, i64 %raw.out.length
  %out = call ptr @arrayNew(i64 %out.length)
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %out.length
  br i1 %done, label %exit, label %check
check:
  %source.index = add i64 %from, %i
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %source.index)
  br i1 %has, label %copy, label %advance
copy:
  %slot.bytes = mul i64 %source.index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %value = load i64, ptr %slot
  call void @arraySet(ptr %out, i64 %i, i64 %value)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayConcat")) {
    definitions.push(`define ptr @arrayConcat(ptr %left, ptr %args) {
entry:
  %left.length = call i64 @arrayLength(ptr %left)
  %args.length = call i64 @arrayLength(ptr %args)
  %out = call ptr @arrayNew(i64 %left.length)
  br label %left.scan
left.scan:
  %left.i = phi i64 [ 0, %entry ], [ %left.next, %left.advance ]
  %left.done = icmp eq i64 %left.i, %left.length
  br i1 %left.done, label %args.scan, label %left.check
left.check:
  %left.has = call i1 @arrayHasOwnIndex(ptr %left, i64 %left.i)
  br i1 %left.has, label %left.copy, label %left.advance
left.copy:
  %left.value = call i64 @arrayGet(ptr %left, i64 %left.i)
  call void @arraySet(ptr %out, i64 %left.i, i64 %left.value)
  br label %left.advance
left.advance:
  %left.next = add i64 %left.i, 1
  br label %left.scan
args.scan:
  %arg.i = phi i64 [ 0, %left.scan ], [ %arg.next, %arg.advance ]
  %out.index = phi i64 [ %left.length, %left.scan ], [ %out.next, %arg.advance ]
  %args.done = icmp eq i64 %arg.i, %args.length
  br i1 %args.done, label %exit, label %arg.load
arg.load:
  %arg.value = call i64 @arrayGet(ptr %args, i64 %arg.i)
  %arg.is.array = call i1 @valueIsArray(i64 %arg.value)
  br i1 %arg.is.array, label %spread.entry, label %append.scalar
append.scalar:
  call void @arraySet(ptr %out, i64 %out.index, i64 %arg.value)
  %scalar.next = add i64 %out.index, 1
  br label %arg.advance
spread.entry:
  %spread.array = call ptr @valueArrayPtr(i64 %arg.value)
  %spread.length = call i64 @arrayLength(ptr %spread.array)
  br label %spread.scan
spread.scan:
  %spread.i = phi i64 [ 0, %spread.entry ], [ %spread.next, %spread.advance ]
  %spread.done = icmp eq i64 %spread.i, %spread.length
  br i1 %spread.done, label %spread.done.block, label %spread.check
spread.check:
  %spread.has = call i1 @arrayHasOwnIndex(ptr %spread.array, i64 %spread.i)
  br i1 %spread.has, label %spread.copy, label %spread.advance
spread.copy:
  %spread.value = call i64 @arrayGet(ptr %spread.array, i64 %spread.i)
  %spread.out.index = add i64 %out.index, %spread.i
  call void @arraySet(ptr %out, i64 %spread.out.index, i64 %spread.value)
  br label %spread.advance
spread.advance:
  %spread.next = add i64 %spread.i, 1
  br label %spread.scan
spread.done.block:
  %spread.out.next = add i64 %out.index, %spread.length
  br label %arg.advance
arg.advance:
  %out.next = phi i64 [ %scalar.next, %append.scalar ], [ %spread.out.next, %spread.done.block ]
  %arg.next = add i64 %arg.i, 1
  br label %args.scan
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayFill")) {
    definitions.push(`define void @arrayFill(ptr %array, i64 %value, i64 %start, i64 %end) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %start.negative = icmp slt i64 %start, 0
  %start.from.end = add i64 %length, %start
  %start.normalized = select i1 %start.negative, i64 %start.from.end, i64 %start
  %start.low = icmp slt i64 %start.normalized, 0
  %start.clamped.low = select i1 %start.low, i64 0, i64 %start.normalized
  %start.high = icmp sgt i64 %start.clamped.low, %length
  %from = select i1 %start.high, i64 %length, i64 %start.clamped.low
  %end.negative = icmp slt i64 %end, 0
  %end.from.end = add i64 %length, %end
  %end.normalized = select i1 %end.negative, i64 %end.from.end, i64 %end
  %end.low = icmp slt i64 %end.normalized, 0
  %end.clamped.low = select i1 %end.low, i64 0, i64 %end.normalized
  %end.high = icmp sgt i64 %end.clamped.low, %length
  %final = select i1 %end.high, i64 %length, i64 %end.clamped.low
  br label %scan
scan:
  %i = phi i64 [ %from, %entry ], [ %next, %body ]
  %done = icmp uge i64 %i, %final
  br i1 %done, label %exit, label %body
body:
  call void @arraySet(ptr %array, i64 %i, i64 %value)
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("arrayReverse")) {
    definitions.push(`define void @arrayReverse(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %exit, label %scan
scan:
  %left = phi i64 [ 0, %entry ], [ %left.next, %swap ]
  %right = phi i64 [ %length, %entry ], [ %right.next, %swap ]
  %right.index = sub i64 %right, 1
  %done = icmp uge i64 %left, %right.index
  br i1 %done, label %exit, label %swap
swap:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %left.bytes = mul i64 %left, 8
  %right.bytes = mul i64 %right.index, 8
  %left.slot = getelementptr i8, ptr %elements, i64 %left.bytes
  %right.slot = getelementptr i8, ptr %elements, i64 %right.bytes
  %left.value = load i64, ptr %left.slot
  %right.value = load i64, ptr %right.slot
  store i64 %right.value, ptr %left.slot
  store i64 %left.value, ptr %right.slot
  %left.next = add i64 %left, 1
  %right.next = sub i64 %right, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("arrayJoin")) {
    definitions.push(`define ptr @arrayJoin(ptr %array, i64 %sep.len, ptr %sep.ptr) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %size.scan
size.scan:
  %size.i = phi i64 [ 0, %entry ], [ %size.next, %size.advance ]
  %total = phi i64 [ 0, %entry ], [ %total.next, %size.advance ]
  %size.done = icmp eq i64 %size.i, %length
  br i1 %size.done, label %alloc, label %size.element
size.element:
  %with.sep = icmp ne i64 %size.i, 0
  %sep.add = select i1 %with.sep, i64 %sep.len, i64 0
  %after.sep = add i64 %total, %sep.add
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %size.i)
  br i1 %has, label %size.present, label %size.advance.empty
size.present:
  %elements.slot.s = getelementptr i8, ptr %array, i64 16
  %elements.s = load ptr, ptr %elements.slot.s
  %slot.bytes.s = mul i64 %size.i, 8
  %slot.s = getelementptr i8, ptr %elements.s, i64 %slot.bytes.s
  %value.s = load i64, ptr %slot.s
  %is.undefined.s = icmp eq i64 %value.s, 9222246136947933184
  br i1 %is.undefined.s, label %size.advance.empty, label %size.string
size.string:
  %string.s = call { ptr, i64 } @valueToString(i64 %value.s)
  %value.len = extractvalue { ptr, i64 } %string.s, 1
  %with.value = add i64 %after.sep, %value.len
  br label %size.advance
size.advance.empty:
  br label %size.advance
size.advance:
  %total.next = phi i64 [ %with.value, %size.string ], [ %after.sep, %size.advance.empty ]
  %size.next = add i64 %size.i, 1
  br label %size.scan
alloc:
  %alloc.size = add i64 %total, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %offset = phi i64 [ 0, %alloc ], [ %offset.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %length
  br i1 %fill.done, label %finish, label %fill.sep
fill.sep:
  %needs.sep = icmp ne i64 %fill.i, 0
  br i1 %needs.sep, label %copy.sep, label %fill.element
copy.sep:
  %sep.dst = getelementptr i8, ptr %out, i64 %offset
  call ptr @memcpy(ptr %sep.dst, ptr %sep.ptr, i64 %sep.len)
  %after.sep.offset = add i64 %offset, %sep.len
  br label %fill.element
fill.element:
  %element.offset = phi i64 [ %after.sep.offset, %copy.sep ], [ %offset, %fill.sep ]
  %has.f = call i1 @arrayHasOwnIndex(ptr %array, i64 %fill.i)
  br i1 %has.f, label %fill.present, label %fill.advance.empty
fill.present:
  %elements.slot.f = getelementptr i8, ptr %array, i64 16
  %elements.f = load ptr, ptr %elements.slot.f
  %slot.bytes.f = mul i64 %fill.i, 8
  %slot.f = getelementptr i8, ptr %elements.f, i64 %slot.bytes.f
  %value.f = load i64, ptr %slot.f
  %is.undefined.f = icmp eq i64 %value.f, 9222246136947933184
  br i1 %is.undefined.f, label %fill.advance.empty, label %copy.value
copy.value:
  %string.f = call { ptr, i64 } @valueToString(i64 %value.f)
  %value.ptr = extractvalue { ptr, i64 } %string.f, 0
  %value.len.f = extractvalue { ptr, i64 } %string.f, 1
  %value.dst = getelementptr i8, ptr %out, i64 %element.offset
  call ptr @memcpy(ptr %value.dst, ptr %value.ptr, i64 %value.len.f)
  %after.value.offset = add i64 %element.offset, %value.len.f
  br label %fill.advance
fill.advance.empty:
  br label %fill.advance
fill.advance:
  %offset.next = phi i64 [ %after.value.offset, %copy.value ], [ %element.offset, %fill.advance.empty ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
finish:
  %nul = getelementptr i8, ptr %out, i64 %offset
  store i8 0, ptr %nul
  ret ptr %out
}
`);
  }
  if (runtime.used.has("arrayPush")) {
    definitions.push(`define i64 @arrayPush(ptr %array, i64 %value) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  call void @arraySet(ptr %array, i64 %length, i64 %value)
  %next.length = add i64 %length, 1
  ret i64 %next.length
}
`);
  }
  if (runtime.used.has("arrayPop")) {
    definitions.push(`define i64 @arrayPop(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %empty.return, label %pop
pop:
  %index = sub i64 %length, 1
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %elements, i64 %slot.bytes
  %stored = load i64, ptr %slot
  %is.hole = icmp eq i64 %stored, 9222246136947933191
  %value = select i1 %is.hole, i64 9222246136947933184, i64 %stored
  store i64 9222246136947933191, ptr %slot
  store i64 %index, ptr %array
  ret i64 %value
empty.return:
  ret i64 9222246136947933184
}
`);
  }
  if (runtime.used.has("arrayUnshift")) {
    definitions.push(`define i64 @arrayUnshift(ptr %array, i64 %value) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %new.length = add i64 %length, 1
  call void @arraySetLength(ptr %array, i64 %new.length)
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  br label %shift.cond
shift.cond:
  %i = phi i64 [ %length, %entry ], [ %prev, %shift.body ]
  %done = icmp eq i64 %i, 0
  br i1 %done, label %store.first, label %shift.body
shift.body:
  %prev = sub i64 %i, 1
  %from.bytes = mul i64 %prev, 8
  %to.bytes = mul i64 %i, 8
  %from = getelementptr i8, ptr %elements, i64 %from.bytes
  %to = getelementptr i8, ptr %elements, i64 %to.bytes
  %moved = load i64, ptr %from
  store i64 %moved, ptr %to
  br label %shift.cond
store.first:
  store i64 %value, ptr %elements
  ret i64 %new.length
}
`);
  }
  if (runtime.used.has("arrayShift")) {
    definitions.push(`define i64 @arrayShift(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %empty.return, label %shift
shift:
  %elements.slot = getelementptr i8, ptr %array, i64 16
  %elements = load ptr, ptr %elements.slot
  %first = load i64, ptr %elements
  %first.hole = icmp eq i64 %first, 9222246136947933191
  %value = select i1 %first.hole, i64 9222246136947933184, i64 %first
  %new.length = sub i64 %length, 1
  br label %loop.cond
loop.cond:
  %i = phi i64 [ 0, %shift ], [ %next, %loop.body ]
  %done = icmp eq i64 %i, %new.length
  br i1 %done, label %clear.tail, label %loop.body
loop.body:
  %next = add i64 %i, 1
  %from.bytes = mul i64 %next, 8
  %to.bytes = mul i64 %i, 8
  %from = getelementptr i8, ptr %elements, i64 %from.bytes
  %to = getelementptr i8, ptr %elements, i64 %to.bytes
  %moved = load i64, ptr %from
  store i64 %moved, ptr %to
  br label %loop.cond
clear.tail:
  %tail.bytes = mul i64 %new.length, 8
  %tail = getelementptr i8, ptr %elements, i64 %tail.bytes
  store i64 9222246136947933191, ptr %tail
  store i64 %new.length, ptr %array
  ret i64 %value
empty.return:
  ret i64 9222246136947933184
}
`);
  }
  if (runtime.used.has("arraySetPrototype")) {
    definitions.push(`define void @arraySetPrototype(ptr %array, ptr %prototype) {
entry:
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  store ptr %prototype, ptr %prototype.slot
  ret void
}
`);
  }
  if (runtime.used.has("arrayGetPrototype")) {
    definitions.push(`define ptr @arrayGetPrototype(ptr %array) {
entry:
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  %prototype = load ptr, ptr %prototype.slot
  ret ptr %prototype
}
`);
  }
  if (runtime.used.has("objectNew")) {
    definitions.push(`define ptr @objectNew(i64 %capacity) {
entry:
  %entries.bytes = mul i64 %capacity, 32
  %object = call ptr @malloc(i64 48)
  %entries = call ptr @malloc(i64 %entries.bytes)
  store i64 0, ptr %object
  %capacity.slot = getelementptr i8, ptr %object, i64 8
  store i64 %capacity, ptr %capacity.slot
  %entries.slot = getelementptr i8, ptr %object, i64 16
  store ptr %entries, ptr %entries.slot
  %shape.version.slot = getelementptr i8, ptr %object, i64 24
  store i64 0, ptr %shape.version.slot
  %prototype.slot = getelementptr i8, ptr %object, i64 32
  store ptr null, ptr %prototype.slot
  %flags.slot = getelementptr i8, ptr %object, i64 40
  store i64 1, ptr %flags.slot
  ret ptr %object
}
`);
  }
  if (runtime.used.has("objectCreate")) {
    definitions.push(`define ptr @objectCreate(ptr %prototype) {
entry:
  %object = call ptr @objectNew(i64 0)
  %prototype.slot = getelementptr i8, ptr %object, i64 32
  store ptr %prototype, ptr %prototype.slot
  ret ptr %object
}
`);
  }
  if (runtime.used.has("objectGetOwn")) {
    definitions.push(`define { i64, i64 } @objectGetOwn(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %missing, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %found, label %advance
found:
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  %found.0 = insertvalue { i64, i64 } undef, i64 1, 0
  %found.1 = insertvalue { i64, i64 } %found.0, i64 %value, 1
  ret { i64, i64 } %found.1
advance:
  %next = add i64 %i, 1
  br label %scan
missing:
  %missing.0 = insertvalue { i64, i64 } undef, i64 0, 0
  %missing.1 = insertvalue { i64, i64 } %missing.0, i64 9222246136947933184, 1
  ret { i64, i64 } %missing.1
}
`);
  }
  if (runtime.used.has("objectGet")) {
    definitions.push(`define i64 @objectGet(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  br label %lookup
lookup:
  %current = phi ptr [ %object, %entry ], [ %prototype, %advance.prototype ]
  %own = call { i64, i64 } @objectGetOwn(ptr %current, i64 %key.len, ptr %key.ptr)
  %found = extractvalue { i64, i64 } %own, 0
  %value = extractvalue { i64, i64 } %own, 1
  %has.own = icmp ne i64 %found, 0
  br i1 %has.own, label %own.found, label %check.prototype
own.found:
  ret i64 %value
check.prototype:
  %prototype.slot = getelementptr i8, ptr %current, i64 32
  %prototype = load ptr, ptr %prototype.slot
  %has.prototype = icmp ne ptr %prototype, null
  br i1 %has.prototype, label %advance.prototype, label %missing
advance.prototype:
  br label %lookup
missing:
  ret i64 9222246136947933184
}
`);
  }
  if (runtime.used.has("objectHasOwn")) {
    definitions.push(`define i1 @objectHasOwn(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %own = call { i64, i64 } @objectGetOwn(ptr %object, i64 %key.len, ptr %key.ptr)
  %found = extractvalue { i64, i64 } %own, 0
  %has.own = icmp ne i64 %found, 0
  ret i1 %has.own
}
`);
  }
  if (runtime.used.has("objectHas")) {
    definitions.push(`define i1 @objectHas(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  br label %lookup
lookup:
  %current = phi ptr [ %object, %entry ], [ %prototype, %advance.prototype ]
  %has.own = call i1 @objectHasOwn(ptr %current, i64 %key.len, ptr %key.ptr)
  br i1 %has.own, label %found, label %check.prototype
found:
  ret i1 true
check.prototype:
  %prototype.slot = getelementptr i8, ptr %current, i64 32
  %prototype = load ptr, ptr %prototype.slot
  %has.prototype = icmp ne ptr %prototype, null
  br i1 %has.prototype, label %advance.prototype, label %missing
advance.prototype:
  br label %lookup
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectSetPrototype")) {
    definitions.push(`define void @objectSetPrototype(ptr %object, ptr %prototype) {
entry:
  %is.null = icmp eq ptr %prototype, null
  br i1 %is.null, label %store, label %check.cycle
check.cycle:
  %cycle = call i1 @objectWouldCreateCycle(ptr %object, ptr %prototype)
  br i1 %cycle, label %exit, label %store
store:
  %prototype.slot = getelementptr i8, ptr %object, i64 32
  store ptr %prototype, ptr %prototype.slot
  ret void
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectWouldCreateCycle")) {
    definitions.push(`define i1 @objectWouldCreateCycle(ptr %object, ptr %prototype) {
entry:
  br label %lookup
lookup:
  %current = phi ptr [ %prototype, %entry ], [ %next, %advance ]
  %is.object = icmp eq ptr %current, %object
  br i1 %is.object, label %cycle, label %check.next
check.next:
  %prototype.slot = getelementptr i8, ptr %current, i64 32
  %next = load ptr, ptr %prototype.slot
  %has.next = icmp ne ptr %next, null
  br i1 %has.next, label %advance, label %ok
advance:
  br label %lookup
cycle:
  ret i1 true
ok:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectGetPrototype")) {
    definitions.push(`define ptr @objectGetPrototype(ptr %object) {
entry:
  %prototype.slot = getelementptr i8, ptr %object, i64 32
  %prototype = load ptr, ptr %prototype.slot
  ret ptr %prototype
}
`);
  }
  if (runtime.used.has("objectPreventExtensions")) {
    definitions.push(`define void @objectPreventExtensions(ptr %object) {
entry:
  %flags.slot = getelementptr i8, ptr %object, i64 40
  %flags = load i64, ptr %flags.slot
  %next.flags = and i64 %flags, -2
  store i64 %next.flags, ptr %flags.slot
  ret void
}
`);
  }
  if (runtime.used.has("objectIsExtensible")) {
    definitions.push(`define i1 @objectIsExtensible(ptr %object) {
entry:
  %ext.flags.slot = getelementptr i8, ptr %object, i64 40
  %ext.flags = load i64, ptr %ext.flags.slot
  %extensible.bit = and i64 %ext.flags, 1
  %is.extensible = icmp ne i64 %extensible.bit, 0
  ret i1 %is.extensible
}
`);
  }
  if (runtime.used.has("objectSeal")) {
    definitions.push(`define void @objectSeal(ptr %object) {
entry:
  call void @objectPreventExtensions(ptr %object)
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %clear, label %advance
clear:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %sealed = and i64 %descriptor, -5
  store i64 %sealed, ptr %descriptor.slot
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectFreeze")) {
    definitions.push(`define void @objectFreeze(ptr %object) {
entry:
  call void @objectSeal(ptr %object)
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %clear, label %advance
clear:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %frozen = and i64 %descriptor, -2
  store i64 %frozen, ptr %descriptor.slot
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectIsSealed")) {
    definitions.push(`define i1 @objectIsSealed(ptr %object) {
entry:
  %is.extensible = call i1 @objectIsExtensible(ptr %object)
  br i1 %is.extensible, label %no, label %scan.entry
scan.entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %scan.entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %yes, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %descriptor.block, label %advance
descriptor.block:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %configurable.bit = and i64 %descriptor, 4
  %configurable = icmp ne i64 %configurable.bit, 0
  br i1 %configurable, label %no, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
yes:
  ret i1 true
no:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectIsFrozen")) {
    definitions.push(`define i1 @objectIsFrozen(ptr %object) {
entry:
  %sealed = call i1 @objectIsSealed(ptr %object)
  br i1 %sealed, label %scan.entry, label %no
scan.entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %scan.entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %yes, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %descriptor.block, label %advance
descriptor.block:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %writable.bit = and i64 %descriptor, 1
  %writable = icmp ne i64 %writable.bit, 0
  br i1 %writable, label %no, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
yes:
  ret i1 true
no:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectDefineDataProperty")) {
    definitions.push(`define void @objectDefineDataProperty(ptr %object, i64 %key.len, ptr %key.ptr, i64 %value, i64 %flags) {
entry:
  %count = load i64, ptr %object
  %capacity.slot = getelementptr i8, ptr %object, i64 8
  %capacity = load i64, ptr %capacity.slot
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %ensure.capacity, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %replace, label %advance
replace:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %configurable.bit = and i64 %descriptor, 4
  %is.configurable = icmp ne i64 %configurable.bit, 0
  br i1 %is.configurable, label %replace.configurable, label %exit
replace.configurable:
  %replace.value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  store i64 %value, ptr %replace.value.slot
  store i64 %flags, ptr %descriptor.slot
  ret void
advance:
  %next = add i64 %i, 1
  br label %scan
ensure.capacity:
  %object.flags.slot = getelementptr i8, ptr %object, i64 40
  %object.flags = load i64, ptr %object.flags.slot
  %extensible.bit = and i64 %object.flags, 1
  %is.extensible = icmp ne i64 %extensible.bit, 0
  br i1 %is.extensible, label %ensure.capacity.extensible, label %exit
ensure.capacity.extensible:
  %has.capacity = icmp ult i64 %count, %capacity
  br i1 %has.capacity, label %append, label %grow
grow:
  %capacity.zero = icmp eq i64 %capacity, 0
  br i1 %capacity.zero, label %grow.empty, label %grow.double
grow.empty:
  br label %grow.copy
grow.double:
  %double.capacity = mul i64 %capacity, 2
  br label %grow.copy
grow.copy:
  %next.capacity = phi i64 [ 1, %grow.empty ], [ %double.capacity, %grow.double ]
  %new.entries.bytes = mul i64 %next.capacity, 32
  %new.entries = call ptr @malloc(i64 %new.entries.bytes)
  %old.entries.bytes = mul i64 %count, 32
  call ptr @memcpy(ptr %new.entries, ptr %entries, i64 %old.entries.bytes)
  store i64 %next.capacity, ptr %capacity.slot
  store ptr %new.entries, ptr %entries.slot
  br label %append
append:
  %append.entries = phi ptr [ %entries, %ensure.capacity.extensible ], [ %new.entries, %grow.copy ]
  %append.bytes = mul i64 %count, 32
  %append.ptr = getelementptr i8, ptr %append.entries, i64 %append.bytes
  store i64 %key.len, ptr %append.ptr
  %append.key.slot = getelementptr i8, ptr %append.ptr, i64 8
  store ptr %key.ptr, ptr %append.key.slot
  %append.value.slot = getelementptr i8, ptr %append.ptr, i64 16
  store i64 %value, ptr %append.value.slot
  %append.descriptor.slot = getelementptr i8, ptr %append.ptr, i64 24
  store i64 %flags, ptr %append.descriptor.slot
  %next.count = add i64 %count, 1
  store i64 %next.count, ptr %object
  %shape.version.slot = getelementptr i8, ptr %object, i64 24
  %shape.version = load i64, ptr %shape.version.slot
  %next.shape.version = add i64 %shape.version, 1
  store i64 %next.shape.version, ptr %shape.version.slot
  ret void
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectSet")) {
    definitions.push(`define void @objectSet(ptr %object, i64 %key.len, ptr %key.ptr, i64 %value) {
entry:
  %count = load i64, ptr %object
  %capacity.slot = getelementptr i8, ptr %object, i64 8
  %capacity = load i64, ptr %capacity.slot
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %ensure.capacity, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %replace, label %advance
replace:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %writable.bit = and i64 %descriptor, 1
  %is.writable = icmp ne i64 %writable.bit, 0
  br i1 %is.writable, label %replace.writable, label %exit
replace.writable:
  %replace.value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  store i64 %value, ptr %replace.value.slot
  ret void
advance:
  %next = add i64 %i, 1
  br label %scan
ensure.capacity:
  %flags.slot = getelementptr i8, ptr %object, i64 40
  %flags = load i64, ptr %flags.slot
  %extensible.bit = and i64 %flags, 1
  %is.extensible = icmp ne i64 %extensible.bit, 0
  br i1 %is.extensible, label %ensure.capacity.extensible, label %exit
ensure.capacity.extensible:
  %has.capacity = icmp ult i64 %count, %capacity
  br i1 %has.capacity, label %append, label %grow
grow:
  %capacity.zero = icmp eq i64 %capacity, 0
  br i1 %capacity.zero, label %grow.empty, label %grow.double
grow.empty:
  br label %grow.copy
grow.double:
  %double.capacity = mul i64 %capacity, 2
  br label %grow.copy
grow.copy:
  %next.capacity = phi i64 [ 1, %grow.empty ], [ %double.capacity, %grow.double ]
  %new.entries.bytes = mul i64 %next.capacity, 32
  %new.entries = call ptr @malloc(i64 %new.entries.bytes)
  %old.entries.bytes = mul i64 %count, 32
  call ptr @memcpy(ptr %new.entries, ptr %entries, i64 %old.entries.bytes)
  store i64 %next.capacity, ptr %capacity.slot
  store ptr %new.entries, ptr %entries.slot
  br label %append
append:
  %append.entries = phi ptr [ %entries, %ensure.capacity.extensible ], [ %new.entries, %grow.copy ]
  %append.bytes = mul i64 %count, 32
  %append.ptr = getelementptr i8, ptr %append.entries, i64 %append.bytes
  store i64 %key.len, ptr %append.ptr
  %append.key.slot = getelementptr i8, ptr %append.ptr, i64 8
  store ptr %key.ptr, ptr %append.key.slot
  %append.value.slot = getelementptr i8, ptr %append.ptr, i64 16
  store i64 %value, ptr %append.value.slot
  %append.descriptor.slot = getelementptr i8, ptr %append.ptr, i64 24
  store i64 7, ptr %append.descriptor.slot
  %next.count = add i64 %count, 1
  store i64 %next.count, ptr %object
  %shape.version.slot = getelementptr i8, ptr %object, i64 24
  %shape.version = load i64, ptr %shape.version.slot
  %next.shape.version = add i64 %shape.version, 1
  store i64 %next.shape.version, ptr %shape.version.slot
  ret void
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectDelete")) {
    definitions.push(`define void @objectDelete(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %delete, label %advance
delete:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %configurable.bit = and i64 %descriptor, 4
  %is.configurable = icmp ne i64 %configurable.bit, 0
  br i1 %is.configurable, label %delete.configurable, label %exit
delete.configurable:
  store i64 -1, ptr %entry.ptr
  %shape.version.slot = getelementptr i8, ptr %object, i64 24
  %shape.version = load i64, ptr %shape.version.slot
  %next.shape.version = add i64 %shape.version, 1
  store i64 %next.shape.version, ptr %shape.version.slot
  ret void
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectAssign")) {
    definitions.push(`define void @objectAssign(ptr %target, ptr %source) {
entry:
  %count = load i64, ptr %source
  %entries.slot = getelementptr i8, ptr %source, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %descriptor.block, label %advance
descriptor.block:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %enumerable.bit = and i64 %descriptor, 2
  %enumerable = icmp ne i64 %enumerable.bit, 0
  br i1 %enumerable, label %copy, label %advance
copy:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  call void @objectSet(ptr %target, i64 %stored.len, ptr %key.ptr, i64 %value)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectAssignArray")) {
    definitions.push(`define void @objectAssignArray(ptr %target, ptr %source) {
entry:
  %length = call i64 @arrayLength(ptr %source)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %named, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %source, i64 %i)
  br i1 %has, label %copy, label %advance
copy:
  %key.ptr = call ptr @indexToString(i64 %i)
  br label %digit.count
digit.count:
  %digit.value = phi i64 [ %i, %copy ], [ %digit.next.value, %digit.more ]
  %digit.len = phi i64 [ 1, %copy ], [ %digit.len.next, %digit.more ]
  %digit.more.check = icmp uge i64 %digit.value, 10
  br i1 %digit.more.check, label %digit.more, label %store
digit.more:
  %digit.next.value = udiv i64 %digit.value, 10
  %digit.len.next = add i64 %digit.len, 1
  br label %digit.count
store:
  %value = call i64 @arrayGet(ptr %source, i64 %i)
  call void @objectSet(ptr %target, i64 %digit.len, ptr %key.ptr, i64 %value)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
named:
  %properties.slot = getelementptr i8, ptr %source, i64 32
  %properties = load ptr, ptr %properties.slot
  call void @objectAssign(ptr %target, ptr %properties)
  ret void
}
`);
  }
  if (runtime.used.has("valueObjectAssign")) {
    definitions.push(`define void @valueObjectAssign(ptr %target, i64 %source) {
entry:
  %tag = and i64 %source, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %source)
  call void @objectAssign(ptr %target, ptr %object.ptr)
  ret void
check.array:
  %is.array = icmp eq i64 %tag, 9221401712017801216
  br i1 %is.array, label %array, label %exit
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %source)
  call void @objectAssignArray(ptr %target, ptr %array.ptr)
  ret void
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectValues")) {
    definitions.push(`define ptr @objectValues(ptr %object) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %value.count = phi i64 [ 0, %entry ], [ %value.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %count
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %count.entry.bytes = mul i64 %count.i, 32
  %count.entry.ptr = getelementptr i8, ptr %entries, i64 %count.entry.bytes
  %count.stored.len = load i64, ptr %count.entry.ptr
  %count.active = icmp sge i64 %count.stored.len, 0
  br i1 %count.active, label %count.descriptor.block, label %count.skip
count.descriptor.block:
  %count.descriptor.slot = getelementptr i8, ptr %count.entry.ptr, i64 24
  %count.descriptor = load i64, ptr %count.descriptor.slot
  %count.enumerable.bit = and i64 %count.descriptor, 2
  %count.enumerable = icmp ne i64 %count.enumerable.bit, 0
  br i1 %count.enumerable, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %value.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %value.count.next = phi i64 [ %included.count, %count.include ], [ %value.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %array = call ptr @arrayNew(i64 %value.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %count
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.entry.bytes = mul i64 %fill.i, 32
  %fill.entry.ptr = getelementptr i8, ptr %entries, i64 %fill.entry.bytes
  %fill.stored.len = load i64, ptr %fill.entry.ptr
  %fill.active = icmp sge i64 %fill.stored.len, 0
  br i1 %fill.active, label %fill.descriptor.block, label %fill.skip
fill.descriptor.block:
  %fill.descriptor.slot = getelementptr i8, ptr %fill.entry.ptr, i64 24
  %fill.descriptor = load i64, ptr %fill.descriptor.slot
  %fill.enumerable.bit = and i64 %fill.descriptor, 2
  %fill.enumerable = icmp ne i64 %fill.enumerable.bit, 0
  br i1 %fill.enumerable, label %fill.include, label %fill.skip
fill.include:
  %value.slot = getelementptr i8, ptr %fill.entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  call void @arraySet(ptr %array, i64 %out.i, i64 %value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %fill.include ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  ret ptr %array
}
`);
  }
  if (runtime.used.has("objectOwnPropertyDescriptor") || runtime.used.has("arrayOwnPropertyDescriptor") || runtime.used.has("arrayLengthPropertyDescriptor")) {
    definitions.push(`@.desc.value = private unnamed_addr constant [6 x i8] c"value\\00"
@.desc.writable = private unnamed_addr constant [9 x i8] c"writable\\00"
@.desc.enumerable = private unnamed_addr constant [11 x i8] c"enumerable\\00"
@.desc.configurable = private unnamed_addr constant [13 x i8] c"configurable\\00"
`);
  }
  if (runtime.used.has("objectOwnPropertyDescriptor")) {
    definitions.push(`define i64 @objectOwnPropertyDescriptor(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %missing, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %found, label %advance
found:
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %flags = load i64, ptr %descriptor.slot
  %writable.bit = and i64 %flags, 1
  %enumerable.bit = and i64 %flags, 2
  %configurable.bit = and i64 %flags, 4
  %writable.ok = icmp ne i64 %writable.bit, 0
  %enumerable.ok = icmp ne i64 %enumerable.bit, 0
  %configurable.ok = icmp ne i64 %configurable.bit, 0
  %writable.value = select i1 %writable.ok, i64 9222246136947933186, i64 9222246136947933185
  %enumerable.value = select i1 %enumerable.ok, i64 9222246136947933186, i64 9222246136947933185
  %configurable.value = select i1 %configurable.ok, i64 9222246136947933186, i64 9222246136947933185
  %desc = call ptr @objectNew(i64 4)
  call void @objectSet(ptr %desc, i64 5, ptr @.desc.value, i64 %value)
  call void @objectSet(ptr %desc, i64 8, ptr @.desc.writable, i64 %writable.value)
  call void @objectSet(ptr %desc, i64 10, ptr @.desc.enumerable, i64 %enumerable.value)
  call void @objectSet(ptr %desc, i64 12, ptr @.desc.configurable, i64 %configurable.value)
  %boxed = call i64 @valueBoxObject(ptr %desc)
  ret i64 %boxed
advance:
  %next = add i64 %i, 1
  br label %scan
missing:
  ret i64 9222246136947933184
}
`);
  }
  if (runtime.used.has("objectEntries")) {
    definitions.push(`define ptr @objectEntries(ptr %object) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %entry.count = phi i64 [ 0, %entry ], [ %entry.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %count
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %count.entry.bytes = mul i64 %count.i, 32
  %count.entry.ptr = getelementptr i8, ptr %entries, i64 %count.entry.bytes
  %count.stored.len = load i64, ptr %count.entry.ptr
  %count.active = icmp sge i64 %count.stored.len, 0
  br i1 %count.active, label %count.descriptor.block, label %count.skip
count.descriptor.block:
  %count.descriptor.slot = getelementptr i8, ptr %count.entry.ptr, i64 24
  %count.descriptor = load i64, ptr %count.descriptor.slot
  %count.enumerable.bit = and i64 %count.descriptor, 2
  %count.enumerable = icmp ne i64 %count.enumerable.bit, 0
  br i1 %count.enumerable, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %entry.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %entry.count.next = phi i64 [ %included.count, %count.include ], [ %entry.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %array = call ptr @arrayNew(i64 %entry.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %count
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.entry.bytes = mul i64 %fill.i, 32
  %fill.entry.ptr = getelementptr i8, ptr %entries, i64 %fill.entry.bytes
  %fill.stored.len = load i64, ptr %fill.entry.ptr
  %fill.active = icmp sge i64 %fill.stored.len, 0
  br i1 %fill.active, label %fill.descriptor.block, label %fill.skip
fill.descriptor.block:
  %fill.descriptor.slot = getelementptr i8, ptr %fill.entry.ptr, i64 24
  %fill.descriptor = load i64, ptr %fill.descriptor.slot
  %fill.enumerable.bit = and i64 %fill.descriptor, 2
  %fill.enumerable = icmp ne i64 %fill.enumerable.bit, 0
  br i1 %fill.enumerable, label %fill.include, label %fill.skip
fill.include:
  %pair = call ptr @arrayNew(i64 2)
  %key.slot = getelementptr i8, ptr %fill.entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %fill.stored.len)
  %value.slot = getelementptr i8, ptr %fill.entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  call void @arraySet(ptr %pair, i64 0, i64 %key.value)
  call void @arraySet(ptr %pair, i64 1, i64 %value)
  %pair.value = call i64 @valueBoxArray(ptr %pair)
  call void @arraySet(ptr %array, i64 %out.i, i64 %pair.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %fill.include ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  ret ptr %array
}
`);
  }
  if (runtime.used.has("objectFromEntries")) {
    definitions.push(`define ptr @objectFromEntries(ptr %entries.array) {
entry:
  %out = call ptr @objectNew(i64 0)
  %length = call i64 @arrayLength(ptr %entries.array)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %exit, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %entries.array, i64 %i)
  br i1 %has, label %load.entry, label %advance
load.entry:
  %entry.value = call i64 @arrayGet(ptr %entries.array, i64 %i)
  %entry.is.array = call i1 @valueIsArray(i64 %entry.value)
  br i1 %entry.is.array, label %entry.array, label %advance
entry.array:
  %entry.ptr = call ptr @valueArrayPtr(i64 %entry.value)
  %entry.length = call i64 @arrayLength(ptr %entry.ptr)
  %has.pair = icmp uge i64 %entry.length, 2
  br i1 %has.pair, label %entry.key, label %advance
entry.key:
  %key.value = call i64 @arrayGet(ptr %entry.ptr, i64 0)
  %key.tag = and i64 %key.value, -281474976710656
  %key.is.string = icmp eq i64 %key.tag, 9221683186994511872
  br i1 %key.is.string, label %entry.store, label %advance
entry.store:
  %value = call i64 @arrayGet(ptr %entry.ptr, i64 1)
  %key.ptr = call ptr @valueStringPtr(i64 %key.value)
  %key.len = call i64 @valueStringLength(i64 %key.value)
  call void @objectSet(ptr %out, i64 %key.len, ptr %key.ptr, i64 %value)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("objectPropertyIsEnumerable")) {
    definitions.push(`define i1 @objectPropertyIsEnumerable(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %missing, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %same.len = icmp eq i64 %stored.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load ptr, ptr %key.slot
  %cmp = call i32 @memcmp(ptr %stored.key, ptr %key.ptr, i64 %key.len)
  %same.key = icmp eq i32 %cmp, 0
  br i1 %same.key, label %found, label %advance
found:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %flags = load i64, ptr %descriptor.slot
  %enumerable.bit = and i64 %flags, 2
  %enumerable = icmp ne i64 %enumerable.bit, 0
  ret i1 %enumerable
advance:
  %next = add i64 %i, 1
  br label %scan
missing:
  ret i1 false
}
`);
  }
  if (runtime.used.has("objectOwnPropertyNames")) {
    definitions.push(`define ptr @objectOwnPropertyNames(ptr %object) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %key.count = phi i64 [ 0, %entry ], [ %key.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %count
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %count.entry.bytes = mul i64 %count.i, 32
  %count.entry.ptr = getelementptr i8, ptr %entries, i64 %count.entry.bytes
  %count.stored.len = load i64, ptr %count.entry.ptr
  %count.active = icmp sge i64 %count.stored.len, 0
  %included.count = add i64 %key.count, 1
  br label %count.advance
count.advance:
  %key.count.next = select i1 %count.active, i64 %included.count, i64 %key.count
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %array = call ptr @arrayNew(i64 %key.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %count
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.entry.bytes = mul i64 %fill.i, 32
  %fill.entry.ptr = getelementptr i8, ptr %entries, i64 %fill.entry.bytes
  %fill.stored.len = load i64, ptr %fill.entry.ptr
  %fill.active = icmp sge i64 %fill.stored.len, 0
  br i1 %fill.active, label %fill.include, label %fill.skip
fill.include:
  %key.slot = getelementptr i8, ptr %fill.entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %fill.stored.len)
  call void @arraySet(ptr %array, i64 %out.i, i64 %key.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %fill.include ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  ret ptr %array
}
`);
  }
  if (runtime.used.has("arrayOwnPropertyNames")) {
    definitions.push(`@.array.name.length = private unnamed_addr constant [7 x i8] c"length\\00"

define ptr @arrayOwnPropertyNames(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %key.count = phi i64 [ 0, %entry ], [ %key.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %length
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %count.i)
  br i1 %has.own, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %key.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %key.count.next = phi i64 [ %included.count, %count.include ], [ %key.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %keys = call ptr @arrayNew(i64 %key.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %length
  br i1 %fill.done, label %push.length.key, label %fill.check
fill.check:
  %fill.has.own = call i1 @arrayHasOwnIndex(ptr %array, i64 %fill.i)
  br i1 %fill.has.own, label %fill.include, label %fill.skip
fill.include:
  %key.ptr = call ptr @indexToString(i64 %fill.i)
  br label %digit.count
digit.count:
  %digit.value = phi i64 [ %fill.i, %fill.include ], [ %digit.next.value, %digit.more ]
  %digit.len = phi i64 [ 1, %fill.include ], [ %digit.len.next, %digit.more ]
  %digit.more.check = icmp uge i64 %digit.value, 10
  br i1 %digit.more.check, label %digit.more, label %box.key
digit.more:
  %digit.next.value = udiv i64 %digit.value, 10
  %digit.len.next = add i64 %digit.len, 1
  br label %digit.count
box.key:
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %digit.len)
  call void @arraySet(ptr %keys, i64 %out.i, i64 %key.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %box.key ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
push.length.key:
  %length.key = call i64 @valueBoxString(ptr @.array.name.length, i64 6)
  call i64 @arrayPush(ptr %keys, i64 %length.key)
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  %named.keys = call ptr @objectOwnPropertyNames(ptr %properties)
  call void @arrayAppendElements(ptr %keys, ptr %named.keys)
  ret ptr %keys
}
`);
  }
  if (runtime.used.has("arrayAppendElements")) {
    definitions.push(`define void @arrayAppendElements(ptr %target, ptr %source) {
entry:
  %length = call i64 @arrayLength(ptr %source)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %exit, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %source, i64 %i)
  br i1 %has, label %append, label %advance
append:
  %value = call i64 @arrayGet(ptr %source, i64 %i)
  call i64 @arrayPush(ptr %target, i64 %value)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret void
}
`);
  }
  if (runtime.used.has("objectOwnPropertyDescriptors")) {
    definitions.push(`define ptr @objectOwnPropertyDescriptors(ptr %object) {
entry:
  %out = call ptr @objectNew(i64 0)
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %check
check:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %include, label %advance
include:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %desc = call i64 @objectOwnPropertyDescriptor(ptr %object, i64 %stored.len, ptr %key.ptr)
  call void @objectSet(ptr %out, i64 %stored.len, ptr %key.ptr, i64 %desc)
  br label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
exit:
  ret ptr %out
}
`);
  }
  if (runtime.used.has("objectKeys")) {
    definitions.push(`define ptr @objectKeys(ptr %object) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  br label %count.scan
count.scan:
  %count.i = phi i64 [ 0, %entry ], [ %count.next, %count.advance ]
  %key.count = phi i64 [ 0, %entry ], [ %key.count.next, %count.advance ]
  %count.done = icmp eq i64 %count.i, %count
  br i1 %count.done, label %alloc, label %count.check
count.check:
  %count.entry.bytes = mul i64 %count.i, 32
  %count.entry.ptr = getelementptr i8, ptr %entries, i64 %count.entry.bytes
  %count.stored.len = load i64, ptr %count.entry.ptr
  %count.active = icmp sge i64 %count.stored.len, 0
  br i1 %count.active, label %count.descriptor.block, label %count.skip
count.descriptor.block:
  %count.descriptor.slot = getelementptr i8, ptr %count.entry.ptr, i64 24
  %count.descriptor = load i64, ptr %count.descriptor.slot
  %count.enumerable.bit = and i64 %count.descriptor, 2
  %count.enumerable = icmp ne i64 %count.enumerable.bit, 0
  br i1 %count.enumerable, label %count.include, label %count.skip
count.include:
  %included.count = add i64 %key.count, 1
  br label %count.advance
count.skip:
  br label %count.advance
count.advance:
  %key.count.next = phi i64 [ %included.count, %count.include ], [ %key.count, %count.skip ]
  %count.next = add i64 %count.i, 1
  br label %count.scan
alloc:
  %array = call ptr @arrayNew(i64 %key.count)
  br label %fill.scan
fill.scan:
  %fill.i = phi i64 [ 0, %alloc ], [ %fill.next, %fill.advance ]
  %out.i = phi i64 [ 0, %alloc ], [ %out.next, %fill.advance ]
  %fill.done = icmp eq i64 %fill.i, %count
  br i1 %fill.done, label %exit, label %fill.check
fill.check:
  %fill.entry.bytes = mul i64 %fill.i, 32
  %fill.entry.ptr = getelementptr i8, ptr %entries, i64 %fill.entry.bytes
  %fill.stored.len = load i64, ptr %fill.entry.ptr
  %fill.active = icmp sge i64 %fill.stored.len, 0
  br i1 %fill.active, label %fill.descriptor.block, label %fill.skip
fill.descriptor.block:
  %fill.descriptor.slot = getelementptr i8, ptr %fill.entry.ptr, i64 24
  %fill.descriptor = load i64, ptr %fill.descriptor.slot
  %fill.enumerable.bit = and i64 %fill.descriptor, 2
  %fill.enumerable = icmp ne i64 %fill.enumerable.bit, 0
  br i1 %fill.enumerable, label %fill.include, label %fill.skip
fill.include:
  %key.slot = getelementptr i8, ptr %fill.entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %key.value = call i64 @valueBoxString(ptr %key.ptr, i64 %fill.stored.len)
  call void @arraySet(ptr %array, i64 %out.i, i64 %key.value)
  %included.out = add i64 %out.i, 1
  br label %fill.advance
fill.skip:
  br label %fill.advance
fill.advance:
  %out.next = phi i64 [ %included.out, %fill.include ], [ %out.i, %fill.skip ]
  %fill.next = add i64 %fill.i, 1
  br label %fill.scan
exit:
  ret ptr %array
}
`);
  }
  return definitions;
}
