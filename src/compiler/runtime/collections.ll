define { i64, i1 } @getCollectionIterator(ptr %collection, i64 %source.kind, i64 %iteration.kind) {
entry:
  %frame = call i64 @gcRootSave()
  %method.slot = getelementptr i8, ptr %collection, i64 32
  %method = load i64, ptr %method.slot
  call void @gcRootPush(i64 %method)
  %missing = icmp eq i64 %method, 9222246136947933184
  br i1 %missing, label %default, label %check.method
default:
  %default.iterator = call i64 @createCollectionIterator(ptr %collection, i64 %source.kind, i64 %iteration.kind)
  br label %success
check.method:
  %callable = call i1 @valueIsFunction(i64 %method)
  br i1 %callable, label %call.method, label %not.callable
call.method:
  %argv = alloca i64, i64 0
  %call = call { i64, i1 } @jsCall(i64 %method, i64 0, ptr %argv, i64 9222246136947933184)
  %custom.iterator = extractvalue { i64, i1 } %call, 0
  %call.exc = extractvalue { i64, i1 } %call, 1
  call void @gcRootPush(i64 %custom.iterator)
  br i1 %call.exc, label %propagate, label %check.result
check.result:
  %is.object = call i1 @valueIsObject(i64 %custom.iterator)
  br i1 %is.object, label %success, label %not.object
success:
  %iterator = phi i64 [ %default.iterator, %default ], [ %custom.iterator, %check.result ]
  %ok.0 = insertvalue { i64, i1 } undef, i64 %iterator, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
propagate:
  %prop.0 = insertvalue { i64, i1 } undef, i64 %custom.iterator, 0
  %prop.1 = insertvalue { i64, i1 } %prop.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %prop.1
not.callable:
  %callable.msg = call i64 @iteratorNotCallableMessage(i64 %method)
  %callable.error = call { i64, i1 } @iteratorTypeError(i64 %callable.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %callable.error
not.object:
  %object.msg = call i64 @valueBoxString(ptr @.iter.msg.iter.not.object, i64 53)
  %object.error = call { i64, i1 } @iteratorTypeError(i64 %object.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %object.error
}
define { i64, i1 } @mapFromIterable(i64 %iterable, i64 %not.iterable.message) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterable)
  call void @gcRootPush(i64 %not.iterable.message)
  %iter.call = call { i64, i1 } @getIteratorValue(i64 %iterable, i64 %not.iterable.message)
  %iter = extractvalue { i64, i1 } %iter.call, 0
  %iter.exc = extractvalue { i64, i1 } %iter.call, 1
  call void @gcRootPush(i64 %iter)
  br i1 %iter.exc, label %fail, label %create
create:
  %collection = call ptr @collectionNew()
  %collection.root = call i64 @valueBoxObject(ptr %collection)
  call void @gcRootPush(i64 %collection.root)
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
  br i1 %is.done, label %success, label %read.value
read.value:
  %entry.value = call i64 @valueObjectGet(i64 %next, i64 5, ptr @.iter.key.value)
  call void @gcRootPush(i64 %entry.value)
  %entry.is.object = call i1 @valueIsObject(i64 %entry.value)
  %entry.is.array = call i1 @valueIsArray(i64 %entry.value)
  %entry.ok = or i1 %entry.is.object, %entry.is.array
  br i1 %entry.ok, label %read.entry, label %bad.entry
read.entry:
  br i1 %entry.is.array, label %entry.array, label %entry.object
entry.array:
  %key.a = call i64 @valueArrayGet(i64 %entry.value, i64 0, i64 1, ptr @.iter.key.0)
  %val.a = call i64 @valueArrayGet(i64 %entry.value, i64 1, i64 1, ptr @.iter.key.1)
  call void @gcRootPush(i64 %key.a)
  call void @gcRootPush(i64 %val.a)
  call void @collectionSet(ptr %collection, i64 %key.a, i64 %val.a)
  br label %loop
entry.object:
  %key.o = call i64 @valueObjectGet(i64 %entry.value, i64 1, ptr @.iter.key.0)
  %val.o = call i64 @valueObjectGet(i64 %entry.value, i64 1, ptr @.iter.key.1)
  call void @gcRootPush(i64 %key.o)
  call void @gcRootPush(i64 %val.o)
  call void @collectionSet(ptr %collection, i64 %key.o, i64 %val.o)
  br label %loop
bad.entry:
  %entry.msg = call i64 @iteratorEntryNotObjectMessage(i64 %entry.value)
  %entry.err = call { i64, i1 } @iteratorTypeError(i64 %entry.msg)
  %entry.err.value = extractvalue { i64, i1 } %entry.err, 0
  br label %fail.payload
success:
  %collection.bits = ptrtoint ptr %collection to i64
  %ok.0 = insertvalue { i64, i1 } undef, i64 %collection.bits, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
fail:
  br label %fail.payload
fail.next:
  br label %fail.payload
fail.payload:
  %err = phi i64 [ %iter, %fail ], [ %next, %fail.next ], [ %entry.err.value, %bad.entry ]
  %fail.0 = insertvalue { i64, i1 } undef, i64 %err, 0
  %fail.1 = insertvalue { i64, i1 } %fail.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %fail.1
}
define { i64, i1 } @setFromIterable(i64 %iterable, i64 %not.iterable.message) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterable)
  call void @gcRootPush(i64 %not.iterable.message)
  %iter.call = call { i64, i1 } @getIteratorValue(i64 %iterable, i64 %not.iterable.message)
  %iter = extractvalue { i64, i1 } %iter.call, 0
  %iter.exc = extractvalue { i64, i1 } %iter.call, 1
  call void @gcRootPush(i64 %iter)
  br i1 %iter.exc, label %fail, label %create
create:
  %collection = call ptr @collectionNew()
  %collection.root = call i64 @valueBoxObject(ptr %collection)
  call void @gcRootPush(i64 %collection.root)
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
  br i1 %is.done, label %success, label %read.value
read.value:
  %item = call i64 @valueObjectGet(i64 %next, i64 5, ptr @.iter.key.value)
  call void @gcRootPush(i64 %item)
  call void @collectionSet(ptr %collection, i64 %item, i64 9222246136947933186)
  br label %loop
success:
  %collection.bits = ptrtoint ptr %collection to i64
  %ok.0 = insertvalue { i64, i1 } undef, i64 %collection.bits, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
fail:
  br label %fail.payload
fail.next:
  br label %fail.payload
fail.payload:
  %err = phi i64 [ %iter, %fail ], [ %next, %fail.next ]
  %fail.0 = insertvalue { i64, i1 } undef, i64 %err, 0
  %fail.1 = insertvalue { i64, i1 } %fail.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %fail.1
}
define ptr @collectionNew() {
entry:
  %cell = call ptr @gcAlloc(i64 4, i64 40)
  %collection = getelementptr i8, ptr %cell, i64 8
  %entries = call ptr @malloc(i64 96)
  store i64 0, ptr %collection
  %used.slot = getelementptr i8, ptr %collection, i64 8
  store i64 0, ptr %used.slot
  %capacity.slot = getelementptr i8, ptr %collection, i64 16
  store i64 4, ptr %capacity.slot
  %entries.slot = getelementptr i8, ptr %collection, i64 24
  store ptr %entries, ptr %entries.slot
  %iterator.slot = getelementptr i8, ptr %collection, i64 32
  store i64 9222246136947933184, ptr %iterator.slot
  ret ptr %collection
}
define i64 @collectionSize(ptr %collection) {
entry:
  %size = load i64, ptr %collection
  ret i64 %size
}
define i64 @collectionFind(ptr %collection, i64 %key) {
entry:
  %used.slot = getelementptr i8, ptr %collection, i64 8
  %used = load i64, ptr %used.slot
  %entries.slot = getelementptr i8, ptr %collection, i64 24
  %entries = load ptr, ptr %entries.slot
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %used
  br i1 %done, label %missing, label %check
check:
  %entry.bytes = mul i64 %i, 24
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %active = load i64, ptr %entry.ptr
  %is.active = icmp ne i64 %active, 0
  br i1 %is.active, label %compare, label %advance
compare:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %stored.key = load i64, ptr %key.slot
  %same = call i1 @valueSameValueZero(i64 %stored.key, i64 %key)
  br i1 %same, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
found:
  ret i64 %i
missing:
  ret i64 -1
}
define void @collectionSet(ptr %collection, i64 %key, i64 %value) {
entry:
  %found = call i64 @collectionFind(ptr %collection, i64 %key)
  %has = icmp sge i64 %found, 0
  br i1 %has, label %update, label %append
update:
  %entries.slot.u = getelementptr i8, ptr %collection, i64 24
  %entries.u = load ptr, ptr %entries.slot.u
  %entry.bytes.u = mul i64 %found, 24
  %entry.ptr.u = getelementptr i8, ptr %entries.u, i64 %entry.bytes.u
  %value.slot.u = getelementptr i8, ptr %entry.ptr.u, i64 16
  store i64 %value, ptr %value.slot.u
  ret void
append:
  %used.slot = getelementptr i8, ptr %collection, i64 8
  %used = load i64, ptr %used.slot
  %capacity.slot = getelementptr i8, ptr %collection, i64 16
  %capacity = load i64, ptr %capacity.slot
  %entries.slot = getelementptr i8, ptr %collection, i64 24
  %entries = load ptr, ptr %entries.slot
  %has.capacity = icmp ult i64 %used, %capacity
  br i1 %has.capacity, label %store, label %grow
grow:
  %new.capacity = mul i64 %capacity, 2
  %new.bytes = mul i64 %new.capacity, 24
  %new.entries = call ptr @malloc(i64 %new.bytes)
  %old.bytes = mul i64 %used, 24
  call ptr @memcpy(ptr %new.entries, ptr %entries, i64 %old.bytes)
  store i64 %new.capacity, ptr %capacity.slot
  store ptr %new.entries, ptr %entries.slot
  br label %store
store:
  %active.entries = phi ptr [ %entries, %append ], [ %new.entries, %grow ]
  %entry.bytes = mul i64 %used, 24
  %entry.ptr = getelementptr i8, ptr %active.entries, i64 %entry.bytes
  store i64 1, ptr %entry.ptr
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  store i64 %key, ptr %key.slot
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  store i64 %value, ptr %value.slot
  %next.used = add i64 %used, 1
  store i64 %next.used, ptr %used.slot
  %size = load i64, ptr %collection
  %next.size = add i64 %size, 1
  store i64 %next.size, ptr %collection
  ret void
}
define i64 @collectionGet(ptr %collection, i64 %key) {
entry:
  %found = call i64 @collectionFind(ptr %collection, i64 %key)
  %has = icmp sge i64 %found, 0
  br i1 %has, label %load, label %missing
load:
  %entries.slot = getelementptr i8, ptr %collection, i64 24
  %entries = load ptr, ptr %entries.slot
  %entry.bytes = mul i64 %found, 24
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %value = load i64, ptr %value.slot
  ret i64 %value
missing:
  ret i64 9222246136947933184
}
define i1 @collectionHas(ptr %collection, i64 %key) {
entry:
  %found = call i64 @collectionFind(ptr %collection, i64 %key)
  %has = icmp sge i64 %found, 0
  ret i1 %has
}
define i1 @collectionDelete(ptr %collection, i64 %key) {
entry:
  %found = call i64 @collectionFind(ptr %collection, i64 %key)
  %has = icmp sge i64 %found, 0
  br i1 %has, label %delete, label %missing
delete:
  %entries.slot = getelementptr i8, ptr %collection, i64 24
  %entries = load ptr, ptr %entries.slot
  %entry.bytes = mul i64 %found, 24
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  store i64 0, ptr %entry.ptr
  %size = load i64, ptr %collection
  %next.size = sub i64 %size, 1
  store i64 %next.size, ptr %collection
  ret i1 true
missing:
  ret i1 false
}
