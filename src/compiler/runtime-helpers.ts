export type RuntimeHelper =
  | "malloc"
  | "memcpy"
  | "memcmp"
  | "strConcat"
  | "strEquals"
  | "valueStrictEquals"
  | "valueBoxString"
  | "valuePrint"
  | "arrayNew"
  | "arrayLength"
  | "arrayGet"
  | "arraySet"
  | "objectNew"
  | "objectGet"
  | "objectDelete"
  | "objectSet";

export type RuntimeHelperEmitter = {
  readonly used: Set<RuntimeHelper>;
};

export const createRuntimeHelperEmitter = (): RuntimeHelperEmitter => ({ used: new Set() });

export function useRuntimeHelper(runtime: RuntimeHelperEmitter, helper: RuntimeHelper): void {
  runtime.used.add(helper);
  if (helper === "strConcat") {
    runtime.used.add("malloc");
    runtime.used.add("memcpy");
  }
  if (helper === "strEquals") {
    runtime.used.add("memcmp");
  }
  if (helper === "arrayNew" || helper === "objectNew") {
    runtime.used.add("malloc");
  }
  if (helper === "valueBoxString") {
    runtime.used.add("malloc");
  }
  if (helper === "arrayGet" || helper === "arraySet") {
    runtime.used.add("arrayLength");
  }
  if (helper === "arraySet") {
    runtime.used.add("malloc");
    runtime.used.add("memcpy");
  }
  if (helper === "objectGet" || helper === "objectSet") {
    runtime.used.add("memcmp");
  }
  if (helper === "objectDelete") {
    runtime.used.add("memcmp");
  }
  if (helper === "objectSet") {
    runtime.used.add("objectGet");
    runtime.used.add("malloc");
    runtime.used.add("memcpy");
  }
}

export function emitRuntimeDeclarations(runtime: RuntimeHelperEmitter): string[] {
  const declarations: string[] = [];
  const declarationByHelper = new Map<RuntimeHelper, string>([
    ["malloc", "declare ptr @malloc(i64)"],
    ["memcpy", "declare ptr @memcpy(ptr, ptr, i64)"],
    ["memcmp", "declare i32 @memcmp(ptr, ptr, i64)"]
  ]);

  for (const helper of ["malloc", "memcpy", "memcmp"] as const) {
    if (runtime.used.has(helper)) {
      const declaration = declarationByHelper.get(helper);
      if (declaration !== undefined) {
        declarations.push(declaration);
      }
    }
  }

  return declarations;
}

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
  ret i1 %same
}
`);
  }
  if (runtime.used.has("valueBoxString")) {
    definitions.push(`define i64 @valueBoxString(ptr %string.ptr) {
entry:
  %box = call ptr @malloc(i64 8)
  store ptr %string.ptr, ptr %box
  %box.bits = ptrtoint ptr %box to i64
  %payload = and i64 %box.bits, 281474976710655
  %value = or i64 %payload, 9221683186994511872
  ret i64 %value
}
`);
  }
  if (runtime.used.has("valuePrint")) {
    definitions.push(`@.value.fmt.number = private unnamed_addr constant [4 x i8] c"%g\\0A\\00"
@.value.true = private unnamed_addr constant [5 x i8] c"true\\00"
@.value.false = private unnamed_addr constant [6 x i8] c"false\\00"
@.value.undefined = private unnamed_addr constant [10 x i8] c"undefined\\00"

define void @valuePrint(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %print.undefined, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %print.false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %print.true, label %check.string
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
print.string:
  %box.bits = and i64 %value, 281474976710655
  %box = inttoptr i64 %box.bits to ptr
  %ptr = load ptr, ptr %box
  call i32 @puts(ptr %ptr)
  ret void
print.number:
  %number = bitcast i64 %value to double
  call i32 (ptr, ...) @printf(ptr @.value.fmt.number, double %number)
  ret void
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
  %array = call ptr @malloc(i64 24)
  %payload.bytes = mul i64 %capacity, 8
  %elements = call ptr @malloc(i64 %payload.bytes)
  store i64 %length, ptr %array
  %capacity.slot = getelementptr i8, ptr %array, i64 8
  store i64 %capacity, ptr %capacity.slot
  %elements.slot = getelementptr i8, ptr %array, i64 16
  store ptr %elements, ptr %elements.slot
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
  if (runtime.used.has("objectNew")) {
    definitions.push(`define ptr @objectNew(i64 %capacity) {
entry:
  %entries.bytes = mul i64 %capacity, 32
  %object = call ptr @malloc(i64 32)
  %entries = call ptr @malloc(i64 %entries.bytes)
  store i64 0, ptr %object
  %capacity.slot = getelementptr i8, ptr %object, i64 8
  store i64 %capacity, ptr %capacity.slot
  %entries.slot = getelementptr i8, ptr %object, i64 16
  store ptr %entries, ptr %entries.slot
  %shape.version.slot = getelementptr i8, ptr %object, i64 24
  store i64 0, ptr %shape.version.slot
  ret ptr %object
}
`);
  }
  if (runtime.used.has("objectGet")) {
    definitions.push(`define i64 @objectGet(ptr %object, i64 %key.len, ptr %key.ptr) {
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
  ret i64 %value
advance:
  %next = add i64 %i, 1
  br label %scan
missing:
  ret i64 9222246136947933184
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
  %replace.value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  store i64 %value, ptr %replace.value.slot
  ret void
advance:
  %next = add i64 %i, 1
  br label %scan
ensure.capacity:
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
  %append.entries = phi ptr [ %entries, %ensure.capacity ], [ %new.entries, %grow.copy ]
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
  return definitions;
}
