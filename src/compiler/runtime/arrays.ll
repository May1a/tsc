define ptr @valueArrayPtr(i64 %value) {
entry:
  %bits = and i64 %value, 281474976710655
  %ptr = inttoptr i64 %bits to ptr
  ret ptr %ptr
}
define { i64, i1 } @arrayFromValue(i64 %source, i64 %mapper, i64 %this.arg) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %source)
  call void @gcRootPush(i64 %mapper)
  call void @gcRootPush(i64 %this.arg)
  %is.undefined = icmp eq i64 %source, 9222246136947933184
  %is.null = icmp eq i64 %source, 9222246136947933187
  br i1 %is.undefined, label %undefined.source, label %check.null
check.null:
  br i1 %is.null, label %null.source, label %check.mapper
undefined.source:
  %undefined.msg = call i64 @valueBoxString(ptr @.iter.msg.from.undefined, i64 72)
  %undefined.err = call { i64, i1 } @iteratorTypeError(i64 %undefined.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %undefined.err
null.source:
  %null.msg = call i64 @valueBoxString(ptr @.iter.msg.from.null, i64 74)
  %null.err = call { i64, i1 } @iteratorTypeError(i64 %null.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %null.err
check.mapper:
  %mapper.missing = icmp eq i64 %mapper, 9222246136947933184
  br i1 %mapper.missing, label %lookup.method, label %validate.mapper
validate.mapper:
  %mapper.is.fn = call i1 @valueIsFunction(i64 %mapper)
  br i1 %mapper.is.fn, label %lookup.method, label %mapper.not.fn
mapper.not.fn:
  %mapper.msg = call i64 @iteratorNotCallableMessage(i64 %mapper)
  %mapper.err = call { i64, i1 } @iteratorTypeError(i64 %mapper.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %mapper.err
lookup.method:
  %method = call i64 @valuePropertyGet(i64 %source, i64 18, ptr @.symbol.iterator.key)
  call void @gcRootPush(i64 %method)
  %is.undefined.method = icmp eq i64 %method, 9222246136947933184
  %is.null.method = icmp eq i64 %method, 9222246136947933187
  %method.missing = or i1 %is.undefined.method, %is.null.method
  br i1 %method.missing, label %array.like, label %check.method
check.method:
  %is.fn = call i1 @valueIsFunction(i64 %method)
  br i1 %is.fn, label %call.method, label %method.not.fn
method.not.fn:
  %msg.nn = call i64 @iteratorNotCallableMessage(i64 %method)
  %method.err = call { i64, i1 } @iteratorTypeError(i64 %msg.nn)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %method.err
call.method:
  %argv = alloca i64, i64 0
  %call = call { i64, i1 } @jsCall(i64 %method, i64 0, ptr %argv, i64 %source)
  %iter = extractvalue { i64, i1 } %call, 0
  %call.exc = extractvalue { i64, i1 } %call, 1
  call void @gcRootPush(i64 %iter)
  br i1 %call.exc, label %fail, label %check.iter
check.iter:
  %iter.is.object = call i1 @valueIsObject(i64 %iter)
  br i1 %iter.is.object, label %create.array, label %iter.not.object
iter.not.object:
  %msg.ino = call i64 @valueBoxString(ptr @.iter.msg.iter.not.object, i64 53)
  %iter.err = call { i64, i1 } @iteratorTypeError(i64 %msg.ino)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %iter.err
create.array:
  %out = call ptr @arrayNew(i64 0)
  %out.root = call i64 @valueBoxArray(ptr %out)
  call void @gcRootPush(i64 %out.root)
  %index.addr = alloca i64
  store i64 0, ptr %index.addr
  %loop.frame = call i64 @gcRootSave()
  br label %loop
loop:
  call void @gcRootRestore(i64 %loop.frame)
  call void @gcSafepoint()
  %next.call = call { i64, i1 } @callIteratorNext(i64 %iter)
  %next = extractvalue { i64, i1 } %next.call, 0
  %next.exc = extractvalue { i64, i1 } %next.call, 1
  call void @gcRootPush(i64 %next)
  br i1 %next.exc, label %fail.next, label %check.done
check.done:
  %done.value = call i64 @valueObjectGet(i64 %next, i64 4, ptr @.iter.key.done)
  %is.done = call i1 @valueTruthy(i64 %done.value)
  br i1 %is.done, label %success, label %read.item
read.item:
  %item = call i64 @valueObjectGet(i64 %next, i64 5, ptr @.iter.key.value)
  call void @gcRootPush(i64 %item)
  %index = load i64, ptr %index.addr
  br i1 %mapper.missing, label %push.item, label %map.item
map.item:
  %index.number = uitofp i64 %index to double
  %index.value = call i64 @valueBoxNumber(double %index.number)
  %map.argv = alloca i64, i64 2
  %map.arg0 = getelementptr i64, ptr %map.argv, i64 0
  store i64 %item, ptr %map.arg0
  %map.arg1 = getelementptr i64, ptr %map.argv, i64 1
  store i64 %index.value, ptr %map.arg1
  %map.call = call { i64, i1 } @jsCall(i64 %mapper, i64 2, ptr %map.argv, i64 %this.arg)
  %mapped = extractvalue { i64, i1 } %map.call, 0
  %map.exc = extractvalue { i64, i1 } %map.call, 1
  call void @gcRootPush(i64 %mapped)
  br i1 %map.exc, label %fail.map, label %push.mapped
push.item:
  br label %push.value
push.mapped:
  br label %push.value
push.value:
  %pushed = phi i64 [ %item, %push.item ], [ %mapped, %push.mapped ]
  call i64 @arrayPush(ptr %out, i64 %pushed)
  %index.next = add i64 %index, 1
  store i64 %index.next, ptr %index.addr
  br label %loop
success:
  %boxed = call i64 @valueBoxArray(ptr %out)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
array.like:
  %is.array = call i1 @valueIsArray(i64 %source)
  br i1 %is.array, label %from.array, label %from.object
from.array:
  %array.ptr = call ptr @valueArrayPtr(i64 %source)
  %copied.array = call ptr @arrayFromArray(ptr %array.ptr)
  br label %array.like.ready
from.object:
  %is.object = call i1 @valueIsObject(i64 %source)
  br i1 %is.object, label %from.object.body, label %from.empty
from.object.body:
  %object.ptr = call ptr @valueObjectPtr(i64 %source)
  %copied.object = call ptr @arrayFromObject(ptr %object.ptr)
  br label %array.like.ready
from.empty:
  %empty = call ptr @arrayNew(i64 0)
  br label %array.like.ready
array.like.ready:
  %array.like.out = phi ptr [ %copied.array, %from.array ], [ %copied.object, %from.object.body ], [ %empty, %from.empty ]
  %array.like.root = call i64 @valueBoxArray(ptr %array.like.out)
  call void @gcRootPush(i64 %array.like.root)
  br i1 %mapper.missing, label %array.like.success, label %array.like.map.init
array.like.map.init:
  %array.like.length = call i64 @arrayLength(ptr %array.like.out)
  %array.like.index.addr = alloca i64
  store i64 0, ptr %array.like.index.addr
  %array.like.loop.frame = call i64 @gcRootSave()
  br label %array.like.map.cond
array.like.map.cond:
  %array.like.index = load i64, ptr %array.like.index.addr
  %array.like.done = icmp uge i64 %array.like.index, %array.like.length
  br i1 %array.like.done, label %array.like.success, label %array.like.map.body
array.like.map.body:
  call void @gcRootRestore(i64 %array.like.loop.frame)
  %array.like.item = call i64 @arrayGet(ptr %array.like.out, i64 %array.like.index)
  %array.like.index.number = uitofp i64 %array.like.index to double
  %array.like.index.value = call i64 @valueBoxNumber(double %array.like.index.number)
  %array.like.argv = alloca i64, i64 2
  %array.like.arg0 = getelementptr i64, ptr %array.like.argv, i64 0
  store i64 %array.like.item, ptr %array.like.arg0
  %array.like.arg1 = getelementptr i64, ptr %array.like.argv, i64 1
  store i64 %array.like.index.value, ptr %array.like.arg1
  %array.like.call = call { i64, i1 } @jsCall(i64 %mapper, i64 2, ptr %array.like.argv, i64 %this.arg)
  %array.like.mapped = extractvalue { i64, i1 } %array.like.call, 0
  %array.like.exc = extractvalue { i64, i1 } %array.like.call, 1
  br i1 %array.like.exc, label %fail.array.like.map, label %array.like.store
array.like.store:
  call void @arraySet(ptr %array.like.out, i64 %array.like.index, i64 %array.like.mapped)
  %array.like.next = add i64 %array.like.index, 1
  store i64 %array.like.next, ptr %array.like.index.addr
  br label %array.like.map.cond
array.like.success:
  %array.like.boxed = call i64 @valueBoxArray(ptr %array.like.out)
  %array.like.ok.0 = insertvalue { i64, i1 } undef, i64 %array.like.boxed, 0
  %array.like.ok.1 = insertvalue { i64, i1 } %array.like.ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %array.like.ok.1
fail:
  br label %fail.payload
fail.next:
  br label %fail.payload
fail.map:
  br label %fail.payload
fail.array.like.map:
  br label %fail.payload
fail.payload:
  %failure = phi i64 [ %iter, %fail ], [ %next, %fail.next ], [ %mapped, %fail.map ], [ %array.like.mapped, %fail.array.like.map ]
  %fail.0 = insertvalue { i64, i1 } undef, i64 %failure, 0
  %fail.1 = insertvalue { i64, i1 } %fail.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %fail.1
}
define i64 @valueArrayGet(i64 %value, i64 %index, i64 %key.len, ptr %key.ptr) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  %result = call i64 @arrayGetWithKey(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr)
  ret i64 %result
}
define i64 @valueArrayLength(i64 %value) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  %length = call i64 @arrayLength(ptr %array)
  ret i64 %length
}
define void @valueArraySet(i64 %value, i64 %index, i64 %stored) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  call void @arraySet(ptr %array, i64 %index, i64 %stored)
  ret void
}
define void @valueArraySetLength(i64 %value, i64 %length) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  call void @arraySetLength(ptr %array, i64 %length)
  ret void
}
define void @valueArrayDelete(i64 %value, i64 %index) {
entry:
  %array = call ptr @valueArrayPtr(i64 %value)
  call void @arrayDelete(ptr %array, i64 %index)
  ret void
}
define ptr @arrayNew(i64 %length) {
entry:
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %capacity.empty, label %capacity.initial
capacity.empty:
  br label %alloc
capacity.initial:
  br label %alloc
alloc:
  %capacity = phi i64 [ 1, %capacity.empty ], [ %length, %capacity.initial ]
  %cell = call ptr @gcAlloc(i64 3, i64 48)
  %array = getelementptr i8, ptr %cell, i64 8
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
define i64 @arrayLength(ptr %array) {
entry:
  %length = load i64, ptr %array
  ret i64 %length
}
define i64 @arrayGet(ptr %array, i64 %index) {
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
define i64 @arrayGetWithKey(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr) {
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
define void @arraySetNamed(ptr %array, i64 %key.len, ptr %key.ptr, i64 %value) {
entry:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  call void @objectSet(ptr %properties, i64 %key.len, ptr %key.ptr, i64 %value)
  ret void
}
define void @arrayDeleteNamed(ptr %array, i64 %key.len, ptr %key.ptr) {
entry:
  %properties.slot = getelementptr i8, ptr %array, i64 32
  %properties = load ptr, ptr %properties.slot
  call void @objectDelete(ptr %properties, i64 %key.len, ptr %key.ptr)
  ret void
}
define i1 @arrayHasOwnIndex(ptr %array, i64 %index) {
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
define void @arraySet(ptr %array, i64 %index, i64 %value) {
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
define void @arrayDelete(ptr %array, i64 %index) {
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
define void @arraySetLength(ptr %array, i64 %new.length) {
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
define i1 @arrayHas(ptr %array, i64 %index, i64 %key.len, ptr %key.ptr) {
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
define ptr @arrayKeys(ptr %array) {
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
define ptr @arrayValues(ptr %array) {
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
define ptr @arrayEntries(ptr %array) {
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
define i64 @arrayOwnPropertyDescriptor(ptr %array, i64 %key.len, ptr %key.ptr, i64 %index) {
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
define i64 @arrayLengthPropertyDescriptor(ptr %array) {
entry:
  %length.i = call i64 @arrayLength(ptr %array)
  %length = uitofp i64 %length.i to double
  %length.value = call i64 @valueBoxNumber(double %length)
  %desc = call ptr @objectNew(i64 4)
  call void @objectSet(ptr %desc, i64 5, ptr @.desc.value, i64 %length.value)
  call void @objectSet(ptr %desc, i64 8, ptr @.desc.writable, i64 9222246136947933186)
  call void @objectSet(ptr %desc, i64 10, ptr @.desc.enumerable, i64 9222246136947933185)
  call void @objectSet(ptr %desc, i64 12, ptr @.desc.configurable, i64 9222246136947933185)
  %boxed = call i64 @valueBoxObject(ptr %desc)
  ret i64 %boxed
}
@.array.desc.length = private unnamed_addr constant [7 x i8] c"length\00"

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
define i1 @arrayIncludes(ptr %array, i64 %needle) {
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
  %same = call i1 @valueSameValueZero(i64 %candidate, i64 %needle)
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
define i64 @arrayIndexOf(ptr %array, i64 %needle, i64 %fromIndex) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %from.negative = icmp slt i64 %fromIndex, 0
  %from.low = select i1 %from.negative, i64 0, i64 %fromIndex
  %from.high = icmp sgt i64 %from.low, %length
  %from = select i1 %from.high, i64 %length, i64 %from.low
  br label %scan
scan:
  %i = phi i64 [ %from, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %i)
  br i1 %has, label %load, label %advance
load:
  %value = call i64 @arrayGet(ptr %array, i64 %i)
  %same = call i1 @valueStrictEquals(i64 %value, i64 %needle)
  br i1 %same, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
found:
  ret i64 %i
missing:
  ret i64 -1
}
define i64 @arrayLastIndexOf(ptr %array, i64 %needle, i64 %fromIndex) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %missing, label %bounds
bounds:
  %last = sub i64 %length, 1
  %from.negative = icmp slt i64 %fromIndex, 0
  %from.low = select i1 %from.negative, i64 0, i64 %fromIndex
  %from.high = icmp sgt i64 %from.low, %last
  %from = select i1 %from.high, i64 %last, i64 %from.low
  %initial = add i64 %from, 1
  br label %scan
scan:
  %i = phi i64 [ %initial, %bounds ], [ %prev, %advance ]
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
define i64 @arrayFind(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %i)
  br i1 %has, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
found:
  %value = call i64 @arrayGet(ptr %array, i64 %i)
  ret i64 %value
missing:
  ret i64 9222246136947933184
}
define i64 @arrayFindIndex(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %check
check:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %i)
  br i1 %has, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
found:
  ret i64 %i
missing:
  ret i64 -1
}
define i64 @arrayAt(ptr %array, i64 %index) {
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
define void @arrayCopyWithin(ptr %array, i64 %target, i64 %start, i64 %end) {
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
define ptr @arraySlice(ptr %array, i64 %start, i64 %end) {
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
define ptr @arraySplice(ptr %array, i64 %start, i64 %deleteCount, i64 %itemCount, ptr %items) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %start.negative = icmp slt i64 %start, 0
  %start.from.end = add i64 %length, %start
  %start.normalized = select i1 %start.negative, i64 %start.from.end, i64 %start
  %start.low = icmp slt i64 %start.normalized, 0
  %start.clamped.low = select i1 %start.low, i64 0, i64 %start.normalized
  %start.high = icmp sgt i64 %start.clamped.low, %length
  %from = select i1 %start.high, i64 %length, i64 %start.clamped.low
  %delete.too.negative = icmp slt i64 %deleteCount, 0
  %delete.negative = select i1 %delete.too.negative, i64 0, i64 %deleteCount
  %remaining = sub i64 %length, %from
  %delete.too.big = icmp sgt i64 %delete.negative, %remaining
  %actual.delete = select i1 %delete.too.big, i64 %remaining, i64 %delete.negative
  %removed = call ptr @arrayNew(i64 %actual.delete)
  br label %removed.scan
removed.scan:
  %r.i = phi i64 [ 0, %entry ], [ %r.next, %r.advance ]
  %r.done = icmp eq i64 %r.i, %actual.delete
  br i1 %r.done, label %shift, label %r.copy
r.copy:
  %src.index = add i64 %from, %r.i
  %r.has = call i1 @arrayHasOwnIndex(ptr %array, i64 %src.index)
  br i1 %r.has, label %r.copy.present, label %r.copy.hole
r.copy.present:
  %r.value = call i64 @arrayGet(ptr %array, i64 %src.index)
  br label %r.copy.store
r.copy.hole:
  %r.value.hole = call i64 @arrayGet(ptr %array, i64 %src.index)
  br label %r.copy.store
r.copy.store:
  %r.candidate = phi i64 [ %r.value, %r.copy.present ], [ %r.value.hole, %r.copy.hole ]
  call void @arraySet(ptr %removed, i64 %r.i, i64 %r.candidate)
  br label %r.advance
r.advance:
  %r.next = add i64 %r.i, 1
  br label %removed.scan
shift:
  %tail.count = sub i64 %length, %from
  %tail.count.sub.delete = sub i64 %tail.count, %actual.delete
  br label %tail.scan
tail.scan:
  %t.i = phi i64 [ 0, %shift ], [ %t.next, %t.advance ]
  %t.done = icmp eq i64 %t.i, %tail.count.sub.delete
  br i1 %t.done, label %insert, label %t.body
t.body:
  %t.from = add i64 %from, %actual.delete
  %t.src = add i64 %t.from, %t.i
  %t.dst = add i64 %from, %t.i
  %t.has = call i1 @arrayHasOwnIndex(ptr %array, i64 %t.src)
  br i1 %t.has, label %t.copy, label %t.delete
t.copy:
  %t.value = call i64 @arrayGet(ptr %array, i64 %t.src)
  call void @arraySet(ptr %array, i64 %t.dst, i64 %t.value)
  br label %t.advance
t.delete:
  call void @arrayDelete(ptr %array, i64 %t.dst)
  br label %t.advance
t.advance:
  %t.next = add i64 %t.i, 1
  br label %tail.scan
insert:
  %new.length.base = sub i64 %length, %actual.delete
  %new.length = add i64 %new.length.base, %itemCount
  call void @arraySetLength(ptr %array, i64 %new.length)
  %shift.back.count = sub i64 %new.length.base, %from
  br label %shift.back.scan
shift.back.scan:
  %b.i = phi i64 [ 0, %insert ], [ %b.next, %b.advance ]
  %b.done = icmp eq i64 %b.i, %shift.back.count
  br i1 %b.done, label %write.items, label %b.body
b.body:
  %b.reverse = sub i64 %shift.back.count, 1
  %b.offset = sub i64 %b.reverse, %b.i
  %b.from = add i64 %from, %b.offset
  %b.to = add i64 %from, %itemCount
  %b.to.add = add i64 %b.to, %b.offset
  %b.has = call i1 @arrayHasOwnIndex(ptr %array, i64 %b.from)
  br i1 %b.has, label %b.copy, label %b.delete
b.copy:
  %b.value = call i64 @arrayGet(ptr %array, i64 %b.from)
  call void @arraySet(ptr %array, i64 %b.to.add, i64 %b.value)
  br label %b.advance
b.delete:
  call void @arrayDelete(ptr %array, i64 %b.to.add)
  br label %b.advance
b.advance:
  %b.next = add i64 %b.i, 1
  br label %shift.back.scan
write.items:
  br label %items.scan
items.scan:
  %i.i = phi i64 [ 0, %write.items ], [ %i.next, %i.advance ]
  %i.done = icmp eq i64 %i.i, %itemCount
  br i1 %i.done, label %done, label %i.body
i.body:
  %i.dst = add i64 %from, %i.i
  %i.has = call i1 @arrayHasOwnIndex(ptr %items, i64 %i.i)
  br i1 %i.has, label %i.copy, label %i.advance
i.copy:
  %i.value = call i64 @arrayGet(ptr %items, i64 %i.i)
  call void @arraySet(ptr %array, i64 %i.dst, i64 %i.value)
  br label %i.advance
i.advance:
  %i.next = add i64 %i.i, 1
  br label %items.scan
done:
  ret ptr %removed
}
define ptr @arrayFlat(ptr %array, i64 %depth) {
entry:
  %out = call ptr @arrayNew(i64 0)
  %out.length = alloca i64
  store i64 0, ptr %out.length
  %length = call i64 @arrayLength(ptr %array)
  br label %outer.scan
outer.scan:
  %o.i = phi i64 [ 0, %entry ], [ %o.next, %o.advance ]
  %o.done = icmp eq i64 %o.i, %length
  br i1 %o.done, label %exit, label %o.body
o.body:
  %o.has = call i1 @arrayHasOwnIndex(ptr %array, i64 %o.i)
  br i1 %o.has, label %o.present, label %o.advance
o.present:
  %o.value = call i64 @arrayGet(ptr %array, i64 %o.i)
  %o.is.array = call i1 @valueIsArray(i64 %o.value)
  br i1 %o.is.array, label %o.flatten, label %o.copy
o.copy:
  %cur = load i64, ptr %out.length
  call void @arraySet(ptr %out, i64 %cur, i64 %o.value)
  %next.cur = add i64 %cur, 1
  store i64 %next.cur, ptr %out.length
  br label %o.advance
o.advance:
  %o.next = add i64 %o.i, 1
  br label %outer.scan
o.flatten:
  %depth.positive = icmp sgt i64 %depth, 0
  br i1 %depth.positive, label %o.spread, label %o.copy
o.spread:
  %o.inner = call ptr @valueArrayPtr(i64 %o.value)
  %o.inner.length = call i64 @arrayLength(ptr %o.inner)
  br label %o.inner.scan
o.inner.scan:
  %i.i = phi i64 [ 0, %o.spread ], [ %i.next, %i.advance ]
  %i.done = icmp eq i64 %i.i, %o.inner.length
  br i1 %i.done, label %o.advance, label %i.body
i.body:
  %i.has = call i1 @arrayHasOwnIndex(ptr %o.inner, i64 %i.i)
  br i1 %i.has, label %i.copy, label %i.advance
i.copy:
  %i.value = call i64 @arrayGet(ptr %o.inner, i64 %i.i)
  %cur.i = load i64, ptr %out.length
  call void @arraySet(ptr %out, i64 %cur.i, i64 %i.value)
  %next.cur.i = add i64 %cur.i, 1
  store i64 %next.cur.i, ptr %out.length
  br label %i.advance
i.advance:
  %i.next = add i64 %i.i, 1
  br label %o.inner.scan
exit:
  ret ptr %out
}
define ptr @arrayConcat(ptr %left, ptr %args) {
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
define void @arrayFill(ptr %array, i64 %value, i64 %start, i64 %end) {
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
define void @arrayReverse(ptr %array) {
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
define ptr @arrayFromArray(ptr %source) {
entry:
  %length = call i64 @arrayLength(ptr %source)
  %out = call ptr @arrayNew(i64 %length)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %body ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %exit, label %body
body:
  %value = call i64 @arrayGet(ptr %source, i64 %i)
  call void @arraySet(ptr %out, i64 %i, i64 %value)
  %next = add i64 %i, 1
  br label %loop
exit:
  ret ptr %out
}
@.array.from.length = private unnamed_addr constant [7 x i8] c"length\00"

define ptr @arrayFromObject(ptr %source) {
entry:
  %length.value = call i64 @objectGet(ptr %source, i64 6, ptr @.array.from.length)
  %length.number = call double @valueToNumber(i64 %length.value)
  %length = fptosi double %length.number to i64
  %out = call ptr @arrayNew(i64 %length)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %get ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %exit, label %body
body:
  %key = call ptr @indexToString(i64 %i)
  br label %key.len.loop
key.len.loop:
  %key.len = phi i64 [ 0, %body ], [ %key.len.next, %key.len.more ]
  %key.char.ptr = getelementptr i8, ptr %key, i64 %key.len
  %key.char = load i8, ptr %key.char.ptr
  %key.done = icmp eq i8 %key.char, 0
  br i1 %key.done, label %get, label %key.len.more
key.len.more:
  %key.len.next = add i64 %key.len, 1
  br label %key.len.loop
get:
  %value = call i64 @objectGet(ptr %source, i64 %key.len, ptr %key)
  call void @arraySet(ptr %out, i64 %i, i64 %value)
  %next = add i64 %i, 1
  br label %loop
exit:
  ret ptr %out
}
define void @arraySortDefault(ptr %array) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  br label %outer.cond
outer.cond:
  %i = phi i64 [ 0, %entry ], [ %next.i, %outer.advance ]
  %outer.done = icmp uge i64 %i, %length
  br i1 %outer.done, label %exit, label %outer.body
outer.body:
  br label %inner.cond
inner.cond:
  %j = phi i64 [ 0, %outer.body ], [ %next.j, %advance ]
  %limit = sub i64 %length, 1
  %inner.done = icmp uge i64 %j, %limit
  br i1 %inner.done, label %outer.advance, label %inner.body
inner.body:
  %next.j = add i64 %j, 1
  %left = call i64 @arrayGet(ptr %array, i64 %j)
  %right = call i64 @arrayGet(ptr %array, i64 %next.j)
  %left.str = call { ptr, i64 } @valueToString(i64 %left)
  %left.ptr = extractvalue { ptr, i64 } %left.str, 0
  %left.len = extractvalue { ptr, i64 } %left.str, 1
  %right.str = call { ptr, i64 } @valueToString(i64 %right)
  %right.ptr = extractvalue { ptr, i64 } %right.str, 0
  %right.len = extractvalue { ptr, i64 } %right.str, 1
  %left.shorter = icmp ult i64 %left.len, %right.len
  %min.len = select i1 %left.shorter, i64 %left.len, i64 %right.len
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %min.len)
  %byte.gt = icmp sgt i32 %cmp, 0
  %bytes.eq = icmp eq i32 %cmp, 0
  %left.longer = icmp ugt i64 %left.len, %right.len
  %prefix.gt = and i1 %bytes.eq, %left.longer
  %swap = or i1 %byte.gt, %prefix.gt
  br i1 %swap, label %swap.block, label %advance
swap.block:
  call void @arraySet(ptr %array, i64 %j, i64 %right)
  call void @arraySet(ptr %array, i64 %next.j, i64 %left)
  br label %advance
advance:
  br label %inner.cond
outer.advance:
  %next.i = add i64 %i, 1
  br label %outer.cond
exit:
  ret void
}
define ptr @arrayJoin(ptr %array, i64 %sep.len, ptr %sep.ptr) {
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
define i64 @arrayPush(ptr %array, i64 %value) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  call void @arraySet(ptr %array, i64 %length, i64 %value)
  %next.length = add i64 %length, 1
  ret i64 %next.length
}
define i64 @arrayPop(ptr %array) {
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
define i64 @arrayUnshift(ptr %array, i64 %value) {
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
define i64 @arrayShift(ptr %array) {
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
define void @arraySetPrototype(ptr %array, ptr %prototype) {
entry:
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  store ptr %prototype, ptr %prototype.slot
  ret void
}
define ptr @arrayGetPrototype(ptr %array) {
entry:
  %prototype.slot = getelementptr i8, ptr %array, i64 24
  %prototype = load ptr, ptr %prototype.slot
  ret ptr %prototype
}
@.array.name.length = private unnamed_addr constant [7 x i8] c"length\00"

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
define void @arrayAppendElements(ptr %target, ptr %source) {
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
