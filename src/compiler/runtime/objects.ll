define ptr @environmentNew(i64 %count) {
entry:
  %slots.bytes = mul i64 %count, 8
  %slots = call ptr @malloc(i64 %slots.bytes)
  %cell = call ptr @gcAlloc(i64 6, i64 16)
  %env = getelementptr i8, ptr %cell, i64 8
  %count.slot = getelementptr i8, ptr %env, i64 0
  store i64 %count, ptr %count.slot
  %slots.slot = getelementptr i8, ptr %env, i64 8
  store ptr %slots, ptr %slots.slot
  ret ptr %env
}
define i64 @environmentGet(ptr %env, i64 %index) {
entry:
  %slots.slot = getelementptr i8, ptr %env, i64 8
  %slots = load ptr, ptr %slots.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %slots, i64 %slot.bytes
  %value = load i64, ptr %slot
  ret i64 %value
}
define void @environmentSet(ptr %env, i64 %index, i64 %value) {
entry:
  %slots.slot = getelementptr i8, ptr %env, i64 8
  %slots = load ptr, ptr %slots.slot
  %slot.bytes = mul i64 %index, 8
  %slot = getelementptr i8, ptr %slots, i64 %slot.bytes
  store i64 %value, ptr %slot
  ret void
}
define i64 @valueObjectGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.function = call i1 @valueIsFunction(i64 %value)
  br i1 %is.function, label %function, label %object
function:
  %function.result = call i64 @functionObjectGet(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i64 %function.result
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %result = call i64 @objectGet(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret i64 %result
}
define void @valueObjectSet(i64 %value, i64 %key.len, ptr %key.ptr, i64 %stored) {
entry:
  %object = call ptr @valueObjectPtr(i64 %value)
  call void @objectSet(ptr %object, i64 %key.len, ptr %key.ptr, i64 %stored)
  ret void
}
define void @valueObjectDelete(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %object, label %check.function
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  call void @objectDelete(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret void
check.function:
  %is.function = icmp eq i64 %tag, 9221964661971222528
  br i1 %is.function, label %function, label %done
function:
  call void @functionObjectDelete(i64 %value, i64 %key.len, ptr %key.ptr)
  ret void
done:
  ret void
}
define i1 @valueObjectHasOwn(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %object, label %check.function
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.has = call i1 @objectHasOwn(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret i1 %object.has
check.function:
  %is.function = icmp eq i64 %tag, 9221964661971222528
  br i1 %is.function, label %function, label %check.array
function:
  %function.has = call i1 @functionObjectHasOwn(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i1 %function.has
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
define ptr @valueObjectKeys(i64 %value) {
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
define ptr @valueObjectValues(i64 %value) {
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
define ptr @valueObjectEntries(i64 %value) {
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
@.value.desc.length = private unnamed_addr constant [7 x i8] c"length\00"

define i64 @valueObjectOwnPropertyDescriptor(i64 %value, i64 %key.len, ptr %key.ptr, i64 %index, i1 %is.length) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %object, label %check.function
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.desc = call i64 @objectOwnPropertyDescriptor(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret i64 %object.desc
check.function:
  %is.function = icmp eq i64 %tag, 9221964661971222528
  br i1 %is.function, label %function, label %check.array
function:
  %function.desc = call i64 @functionObjectOwnPropertyDescriptor(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i64 %function.desc
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
define ptr @valueObjectOwnPropertyNames(i64 %value) {
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
define ptr @valueObjectOwnPropertyDescriptors(i64 %value) {
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
define ptr @objectNew(i64 %capacity) {
entry:
  %entries.bytes = mul i64 %capacity, 32
  %cell = call ptr @gcAlloc(i64 2, i64 64)
  %object = getelementptr i8, ptr %cell, i64 8
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
  %class.slot = getelementptr i8, ptr %object, i64 48
  store i64 0, ptr %class.slot
  ret ptr %object
}
define ptr @objectCreate(ptr %prototype) {
entry:
  %object = call ptr @objectNew(i64 0)
  %prototype.slot = getelementptr i8, ptr %object, i64 32
  store ptr %prototype, ptr %prototype.slot
  ret ptr %object
}
define { i64, i64 } @objectGetOwn(ptr %object, i64 %key.len, ptr %key.ptr) {
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
define i64 @objectGet(ptr %object, i64 %key.len, ptr %key.ptr) {
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
define i1 @objectHasOwn(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %own = call { i64, i64 } @objectGetOwn(ptr %object, i64 %key.len, ptr %key.ptr)
  %found = extractvalue { i64, i64 } %own, 0
  %has.own = icmp ne i64 %found, 0
  ret i1 %has.own
}
define i1 @objectHas(ptr %object, i64 %key.len, ptr %key.ptr) {
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
define void @objectSetPrototype(ptr %object, ptr %prototype) {
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
define i1 @objectWouldCreateCycle(ptr %object, ptr %prototype) {
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
define ptr @objectGetPrototype(ptr %object) {
entry:
  %prototype.slot = getelementptr i8, ptr %object, i64 32
  %prototype = load ptr, ptr %prototype.slot
  ret ptr %prototype
}
define void @objectPreventExtensions(ptr %object) {
entry:
  %flags.slot = getelementptr i8, ptr %object, i64 40
  %flags = load i64, ptr %flags.slot
  %next.flags = and i64 %flags, -2
  store i64 %next.flags, ptr %flags.slot
  ret void
}
define i1 @objectIsExtensible(ptr %object) {
entry:
  %ext.flags.slot = getelementptr i8, ptr %object, i64 40
  %ext.flags = load i64, ptr %ext.flags.slot
  %extensible.bit = and i64 %ext.flags, 1
  %is.extensible = icmp ne i64 %extensible.bit, 0
  ret i1 %is.extensible
}
define void @objectSeal(ptr %object) {
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
define void @objectFreeze(ptr %object) {
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
define i1 @objectIsSealed(ptr %object) {
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
define i1 @objectIsFrozen(ptr %object) {
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
define void @objectDefineDataProperty(ptr %object, i64 %key.len, ptr %key.ptr, i64 %value, i64 %flags) {
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
define void @objectSet(ptr %object, i64 %key.len, ptr %key.ptr, i64 %value) {
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
define void @objectDelete(ptr %object, i64 %key.len, ptr %key.ptr) {
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
define void @objectAssign(ptr %target, ptr %source) {
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
define void @objectAssignArray(ptr %target, ptr %source) {
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
define void @valueObjectAssign(ptr %target, i64 %source) {
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
define ptr @objectValues(ptr %object) {
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
@.desc.value = private unnamed_addr constant [6 x i8] c"value\00"
@.desc.writable = private unnamed_addr constant [9 x i8] c"writable\00"
@.desc.enumerable = private unnamed_addr constant [11 x i8] c"enumerable\00"
@.desc.configurable = private unnamed_addr constant [13 x i8] c"configurable\00"
define i64 @objectOwnPropertyDescriptor(ptr %object, i64 %key.len, ptr %key.ptr) {
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
define ptr @objectEntries(ptr %object) {
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
define ptr @objectFromEntries(ptr %entries.array) {
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
define i1 @objectPropertyIsEnumerable(ptr %object, i64 %key.len, ptr %key.ptr) {
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
define ptr @objectOwnPropertyNames(ptr %object) {
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
define ptr @objectOwnPropertyDescriptors(ptr %object) {
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
define i1 @objectIs(i64 %left, i64 %right) {
entry:
  %left.d = call double @valueNumber(i64 %left)
  %right.d = call double @valueNumber(i64 %right)
  %same.bits = icmp eq i64 %left, %right
  br i1 %same.bits, label %check.signed.zero, label %check.strings
check.signed.zero:
  %is.zero.l = fcmp oeq double %left.d, 0.0
  %is.zero.r = fcmp oeq double %right.d, 0.0
  %both.zero = and i1 %is.zero.l, %is.zero.r
  br i1 %both.zero, label %check.signs, label %true
check.signs:
  %left.sign = and i64 %left, -9223372036854775808
  %right.sign = and i64 %right, -9223372036854775808
  %same.sign = icmp eq i64 %left.sign, %right.sign
  br i1 %same.sign, label %true, label %false
check.strings:
  %left.tag = and i64 %left, -281474976710656
  %right.tag = and i64 %right, -281474976710656
  %left.string = icmp eq i64 %left.tag, 9221683186994511872
  %right.string = icmp eq i64 %right.tag, 9221683186994511872
  %both.strings = and i1 %left.string, %right.string
  br i1 %both.strings, label %string.compare, label %check.objects
string.compare:
  %left.len = call i64 @valueStringLength(i64 %left)
  %right.len = call i64 @valueStringLength(i64 %right)
  %same.len = icmp eq i64 %left.len, %right.len
  br i1 %same.len, label %string.bytes, label %false
string.bytes:
  %left.ptr = call ptr @valueStringPtr(i64 %left)
  %right.ptr = call ptr @valueStringPtr(i64 %right)
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)
  %same.bytes = icmp eq i32 %cmp, 0
  br i1 %same.bytes, label %true, label %false
check.objects:
  %left.object = icmp eq i64 %left.tag, 9221120237041090560
  %right.object = icmp eq i64 %right.tag, 9221120237041090560
  %both.objects = and i1 %left.object, %right.object
  br i1 %both.objects, label %object.compare, label %check.arrays
object.compare:
  %left.obj.ptr = call ptr @valueObjectPtr(i64 %left)
  %right.obj.ptr = call ptr @valueObjectPtr(i64 %right)
  %same.obj.ptr = icmp eq ptr %left.obj.ptr, %right.obj.ptr
  br i1 %same.obj.ptr, label %true, label %false
check.arrays:
  %left.array = icmp eq i64 %left.tag, 9221401712017801216
  %right.array = icmp eq i64 %right.tag, 9221401712017801216
  %both.arrays = and i1 %left.array, %right.array
  br i1 %both.arrays, label %array.compare, label %check.functions
array.compare:
  %left.arr.ptr = call ptr @valueArrayPtr(i64 %left)
  %right.arr.ptr = call ptr @valueArrayPtr(i64 %right)
  %same.arr.ptr = icmp eq ptr %left.arr.ptr, %right.arr.ptr
  br i1 %same.arr.ptr, label %true, label %false
check.functions:
  %left.function = icmp eq i64 %left.tag, 9221964661971222528
  %right.function = icmp eq i64 %right.tag, 9221964661971222528
  %both.functions = and i1 %left.function, %right.function
  br i1 %both.functions, label %function.compare, label %check.nan
function.compare:
  %left.fn.ptr = call ptr @valueFunctionPtr(i64 %left)
  %right.fn.ptr = call ptr @valueFunctionPtr(i64 %right)
  %same.fn.ptr = icmp eq ptr %left.fn.ptr, %right.fn.ptr
  br i1 %same.fn.ptr, label %true, label %false
check.nan:
  %left.nan = fcmp uno double %left.d, 0.0
  %right.nan = fcmp uno double %right.d, 0.0
  %both.nan = and i1 %left.nan, %right.nan
  br i1 %both.nan, label %true, label %false
true:
  ret i1 true
false:
  ret i1 false
}
define ptr @objectKeys(ptr %object) {
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
