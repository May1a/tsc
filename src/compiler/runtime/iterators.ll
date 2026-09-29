@.symbol.iterator.key = private unnamed_addr constant [19 x i8] c"\EF\A3\BFSymbol.iterator\00"
@.iter.key.next = private unnamed_addr constant [5 x i8] c"next\00"
@.iter.key.return = private unnamed_addr constant [7 x i8] c"return\00"
@.iter.key.value = private unnamed_addr constant [6 x i8] c"value\00"
@.iter.key.done = private unnamed_addr constant [5 x i8] c"done\00"
@.iter.key.0 = private unnamed_addr constant [2 x i8] c"0\00"
@.iter.key.1 = private unnamed_addr constant [2 x i8] c"1\00"
@.iter.err.name = private unnamed_addr constant [10 x i8] c"TypeError\00"
@.iter.msg.iter.not.object = private unnamed_addr constant [54 x i8] c"Result of the Symbol.iterator method is not an object\00"
@.iter.msg.prefix.number = private unnamed_addr constant [8 x i8] c"number \00"
@.iter.msg.prefix.boolean = private unnamed_addr constant [9 x i8] c"boolean \00"
@.iter.msg.prefix.object = private unnamed_addr constant [8 x i8] c"object \00"
@.iter.msg.prefix.string = private unnamed_addr constant [9 x i8] c"string \22\00"
@.iter.msg.object.not.fn = private unnamed_addr constant [25 x i8] c"object is not a function\00"
@.iter.msg.not.fn = private unnamed_addr constant [19 x i8] c" is not a function\00"
@.iter.msg.quoted.not.fn = private unnamed_addr constant [20 x i8] c"\22 is not a function\00"
@.iter.msg.result.prefix = private unnamed_addr constant [17 x i8] c"Iterator result \00"
@.iter.msg.not.object = private unnamed_addr constant [18 x i8] c" is not an object\00"
@.iter.msg.entry.prefix = private unnamed_addr constant [16 x i8] c"Iterator value \00"
@.iter.msg.entry.suffix = private unnamed_addr constant [24 x i8] c" is not an entry object\00"
@.iter.msg.from.undefined = private unnamed_addr constant [73 x i8] c"undefined is not iterable (cannot read property Symbol(Symbol.iterator))\00"
@.iter.msg.from.null = private unnamed_addr constant [75 x i8] c"object null is not iterable (cannot read property Symbol(Symbol.iterator))\00"

define { i64, i1 } @iteratorTypeError(i64 %message) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %message)
  %error = call ptr @errorNew(i64 2, i64 9, ptr @.iter.err.name, i64 %message)
  %error.value = call i64 @valueBoxObject(ptr %error)
  %result.0 = insertvalue { i64, i1 } undef, i64 %error.value, 0
  %result.1 = insertvalue { i64, i1 } %result.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result.1
}
define i64 @iteratorResultObject(i64 %value, i1 %done) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %value)
  %object = call ptr @objectNew(i64 2)
  call void @objectSet(ptr %object, i64 5, ptr @.iter.key.value, i64 %value)
  %done.value = select i1 %done, i64 9222246136947933186, i64 9222246136947933185
  call void @objectSet(ptr %object, i64 4, ptr @.iter.key.done, i64 %done.value)
  %boxed = call i64 @valueBoxObject(ptr %object)
  call void @gcRootRestore(i64 %frame)
  ret i64 %boxed
}
define i64 @createIteratorObject(i64 %source.bits, i64 %source.kind, i64 %iteration.kind) {
entry:
  %frame = call i64 @gcRootSave()
  ; Only array/string sources are JSValues safe to root. Map/Set pass a raw
  ; collection payload pointer that the iterator state cell keeps alive via GC.
  %is.array = icmp eq i64 %source.kind, 0
  %is.string = icmp eq i64 %source.kind, 1
  %is.boxed = or i1 %is.array, %is.string
  br i1 %is.boxed, label %root.source, label %alloc
root.source:
  call void @gcRootPush(i64 %source.bits)
  br label %alloc
alloc:
  %cell = call ptr @gcAlloc(i64 7, i64 40)
  %state = getelementptr i8, ptr %cell, i64 8
  store i64 0, ptr %state
  %kind.slot = getelementptr i8, ptr %state, i64 8
  store i64 %source.kind, ptr %kind.slot
  %iter.slot = getelementptr i8, ptr %state, i64 16
  store i64 %iteration.kind, ptr %iter.slot
  %source.slot = getelementptr i8, ptr %state, i64 24
  store i64 %source.bits, ptr %source.slot
  %done.slot = getelementptr i8, ptr %state, i64 32
  store i64 0, ptr %done.slot
  %next.fn = call i64 @functionObjectNew(ptr @builtinIteratorNext, ptr %state, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  call void @gcRootPush(i64 %next.fn)
  %object = call ptr @objectNew(i64 1)
  call void @objectSet(ptr %object, i64 4, ptr @.iter.key.next, i64 %next.fn)
  %boxed = call i64 @valueBoxObject(ptr %object)
  call void @gcRootRestore(i64 %frame)
  ret i64 %boxed
}

define i64 @createArrayIterator(i64 %array.value) {
entry:
  %result = call i64 @createIteratorObject(i64 %array.value, i64 0, i64 1)
  ret i64 %result
}

define i64 @createStringIterator(i64 %string.value) {
entry:
  %result = call i64 @createIteratorObject(i64 %string.value, i64 1, i64 1)
  ret i64 %result
}

define i64 @createCollectionIterator(ptr %collection, i64 %source.kind, i64 %iteration.kind) {
entry:
  %bits = ptrtoint ptr %collection to i64
  %result = call i64 @createIteratorObject(i64 %bits, i64 %source.kind, i64 %iteration.kind)
  ret i64 %result
}
define { i64, i1 } @arrayIteratorMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %iterator = call i64 @createArrayIterator(i64 %this.value)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %iterator, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok.1
}
define { i64, i1 } @stringIteratorMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %iterator = call i64 @createStringIterator(i64 %this.value)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %iterator, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok.1
}
define { i64, i1 } @builtinIteratorNext(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  %done.slot = getelementptr i8, ptr %env, i64 32
  %done.flag = load i64, ptr %done.slot
  %is.done = icmp ne i64 %done.flag, 0
  br i1 %is.done, label %exhausted, label %load.state
load.state:
  %index = load i64, ptr %env
  %kind.slot = getelementptr i8, ptr %env, i64 8
  %source.kind = load i64, ptr %kind.slot
  %iter.slot = getelementptr i8, ptr %env, i64 16
  %iteration.kind = load i64, ptr %iter.slot
  %source.slot = getelementptr i8, ptr %env, i64 24
  %source.bits = load i64, ptr %source.slot
  %is.array = icmp eq i64 %source.kind, 0
  br i1 %is.array, label %array, label %check.string
check.string:
  %is.string = icmp eq i64 %source.kind, 1
  br i1 %is.string, label %string, label %collection
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %source.bits)
  %array.len = call i64 @arrayLength(ptr %array.ptr)
  %array.done = icmp uge i64 %index, %array.len
  br i1 %array.done, label %mark.done, label %array.yield
array.yield:
  %array.value = call i64 @arrayGet(ptr %array.ptr, i64 %index)
  call void @gcRootPush(i64 %array.value)
  %array.next = add i64 %index, 1
  store i64 %array.next, ptr %env
  %array.result = call i64 @iteratorResultObject(i64 %array.value, i1 false)
  br label %success
string:
  %str.ptr = call ptr @valueStringPtr(i64 %source.bits)
  %str.len = call i64 @valueStringLength(i64 %source.bits)
  %string.done = icmp uge i64 %index, %str.len
  br i1 %string.done, label %mark.done, label %string.decode
string.decode:
  %byte.ptr = getelementptr i8, ptr %str.ptr, i64 %index
  %byte0 = load i8, ptr %byte.ptr
  %b0 = zext i8 %byte0 to i64
  %is.ascii = icmp ult i8 %byte0, 128
  br i1 %is.ascii, label %string.ascii, label %string.multi
string.ascii:
  %ascii.out = call ptr @malloc(i64 2)
  store i8 %byte0, ptr %ascii.out
  %ascii.nul = getelementptr i8, ptr %ascii.out, i64 1
  store i8 0, ptr %ascii.nul
  %ascii.next = add i64 %index, 1
  store i64 %ascii.next, ptr %env
  %ascii.value = call i64 @valueBoxString(ptr %ascii.out, i64 1)
  call void @gcRootPush(i64 %ascii.value)
  %ascii.result = call i64 @iteratorResultObject(i64 %ascii.value, i1 false)
  br label %success
string.multi:
  %is.2 = icmp ult i8 %byte0, 224
  %is.3 = icmp ult i8 %byte0, 240
  br i1 %is.2, label %string.2, label %string.check3
string.check3:
  br i1 %is.3, label %string.3, label %string.4
string.2:
  %seq.len.2 = add i64 0, 2
  br label %string.copy
string.3:
  %seq.len.3 = add i64 0, 3
  br label %string.copy
string.4:
  %seq.len.4 = add i64 0, 4
  br label %string.copy
string.copy:
  %seq.len = phi i64 [ %seq.len.2, %string.2 ], [ %seq.len.3, %string.3 ], [ %seq.len.4, %string.4 ]
  %remain = sub i64 %str.len, %index
  %fits = icmp ule i64 %seq.len, %remain
  %copy.len = select i1 %fits, i64 %seq.len, i64 1
  %alloc.size = add i64 %copy.len, 1
  %seq.out = call ptr @malloc(i64 %alloc.size)
  %seq.src = getelementptr i8, ptr %str.ptr, i64 %index
  call ptr @memcpy(ptr %seq.out, ptr %seq.src, i64 %copy.len)
  %seq.nul = getelementptr i8, ptr %seq.out, i64 %copy.len
  store i8 0, ptr %seq.nul
  %seq.next = add i64 %index, %copy.len
  store i64 %seq.next, ptr %env
  %seq.value = call i64 @valueBoxString(ptr %seq.out, i64 %copy.len)
  call void @gcRootPush(i64 %seq.value)
  %seq.result = call i64 @iteratorResultObject(i64 %seq.value, i1 false)
  br label %success
collection:
  %col.ptr = inttoptr i64 %source.bits to ptr
  br label %collection.scan
collection.scan:
  %scan.index = phi i64 [ %index, %collection ], [ %scan.next, %collection.advance ]
  %used.slot = getelementptr i8, ptr %col.ptr, i64 8
  %used = load i64, ptr %used.slot
  %in.range = icmp ult i64 %scan.index, %used
  br i1 %in.range, label %collection.check, label %mark.done
collection.check:
  %entries.slot = getelementptr i8, ptr %col.ptr, i64 24
  %entries = load ptr, ptr %entries.slot
  %entry.bytes = mul i64 %scan.index, 24
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %active = load i64, ptr %entry.ptr
  %is.active = icmp ne i64 %active, 0
  br i1 %is.active, label %collection.found, label %collection.advance
collection.advance:
  %scan.next = add i64 %scan.index, 1
  br label %collection.scan
collection.found:
  %found.next = add i64 %scan.index, 1
  store i64 %found.next, ptr %env
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %key = load i64, ptr %key.slot
  call void @gcRootPush(i64 %key)
  %is.keys = icmp eq i64 %iteration.kind, 0
  br i1 %is.keys, label %collection.keys, label %collection.not.keys
collection.not.keys:
  %is.map = icmp eq i64 %source.kind, 2
  br i1 %is.map, label %collection.map.value, label %collection.set.value
collection.map.value:
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %map.value = load i64, ptr %value.slot
  call void @gcRootPush(i64 %map.value)
  %is.values = icmp eq i64 %iteration.kind, 1
  br i1 %is.values, label %collection.values.map, label %collection.entries.map
collection.set.value:
  %is.values.set = icmp eq i64 %iteration.kind, 1
  br i1 %is.values.set, label %collection.values.set, label %collection.entries.set
collection.keys:
  %keys.result = call i64 @iteratorResultObject(i64 %key, i1 false)
  br label %success
collection.values.map:
  %values.map.result = call i64 @iteratorResultObject(i64 %map.value, i1 false)
  br label %success
collection.values.set:
  %values.set.result = call i64 @iteratorResultObject(i64 %key, i1 false)
  br label %success
collection.entries.map:
  %pair.map = call ptr @arrayNew(i64 2)
  call void @arraySet(ptr %pair.map, i64 0, i64 %key)
  call void @arraySet(ptr %pair.map, i64 1, i64 %map.value)
  %pair.map.boxed = call i64 @valueBoxArray(ptr %pair.map)
  call void @gcRootPush(i64 %pair.map.boxed)
  %entries.map.result = call i64 @iteratorResultObject(i64 %pair.map.boxed, i1 false)
  br label %success
collection.entries.set:
  %pair.set = call ptr @arrayNew(i64 2)
  call void @arraySet(ptr %pair.set, i64 0, i64 %key)
  call void @arraySet(ptr %pair.set, i64 1, i64 %key)
  %pair.set.boxed = call i64 @valueBoxArray(ptr %pair.set)
  call void @gcRootPush(i64 %pair.set.boxed)
  %entries.set.result = call i64 @iteratorResultObject(i64 %pair.set.boxed, i1 false)
  br label %success
mark.done:
  store i64 1, ptr %done.slot
  br label %exhausted
exhausted:
  %exhausted.result = call i64 @iteratorResultObject(i64 9222246136947933184, i1 true)
  br label %success
success:
  %result.value = phi i64 [ %array.result, %array.yield ], [ %ascii.result, %string.ascii ], [ %seq.result, %string.copy ], [ %keys.result, %collection.keys ], [ %values.map.result, %collection.values.map ], [ %values.set.result, %collection.values.set ], [ %entries.map.result, %collection.entries.map ], [ %entries.set.result, %collection.entries.set ], [ %exhausted.result, %exhausted ]
  %ok.0 = insertvalue { i64, i1 } undef, i64 %result.value, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
}
define { i64, i1 } @getIteratorValue(i64 %iterable, i64 %not.iterable.message) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterable)
  call void @gcRootPush(i64 %not.iterable.message)
  %is.object = call i1 @valueIsObject(i64 %iterable)
  %is.array = call i1 @valueIsArray(i64 %iterable)
  %is.string = call i1 @valueIsString(i64 %iterable)
  %is.obj.or.arr = or i1 %is.object, %is.array
  %is.iterable.tag = or i1 %is.obj.or.arr, %is.string
  br i1 %is.iterable.tag, label %lookup, label %not.iterable
lookup:
  %method = call i64 @valuePropertyGet(i64 %iterable, i64 18, ptr @.symbol.iterator.key)
  call void @gcRootPush(i64 %method)
  %is.fn = call i1 @valueIsFunction(i64 %method)
  br i1 %is.fn, label %call.method, label %not.iterable
call.method:
  %argv = alloca i64, i64 0
  %call = call { i64, i1 } @jsCall(i64 %method, i64 0, ptr %argv, i64 %iterable)
  %call.payload = extractvalue { i64, i1 } %call, 0
  %call.exc = extractvalue { i64, i1 } %call, 1
  call void @gcRootPush(i64 %call.payload)
  br i1 %call.exc, label %propagate, label %check.iterator
propagate:
  %prop.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %prop.1 = insertvalue { i64, i1 } %prop.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %prop.1
check.iterator:
  %iter.is.object = call i1 @valueIsObject(i64 %call.payload)
  br i1 %iter.is.object, label %success, label %iter.not.object
success:
  %ok.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
not.iterable:
  %not.iterable.error = call { i64, i1 } @iteratorTypeError(i64 %not.iterable.message)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %not.iterable.error
iter.not.object:
  %msg.ino = call i64 @valueBoxString(ptr @.iter.msg.iter.not.object, i64 53)
  %iter.not.object.error = call { i64, i1 } @iteratorTypeError(i64 %msg.ino)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %iter.not.object.error
}
define i64 @iteratorNotCallableMessage(i64 %value) {
entry:
  %raw = call { ptr, i64 } @valueToString(i64 %value)
  %raw.ptr = extractvalue { ptr, i64 } %raw, 0
  %raw.len = extractvalue { ptr, i64 } %raw, 1
  %tag = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tag, 9221683186994511872
  br i1 %is.string, label %string, label %check.undefined
check.undefined:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %without.prefix, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %null, label %check.boolean
check.boolean:
  %is.false = icmp eq i64 %value, 9222246136947933185
  %is.true = icmp eq i64 %value, 9222246136947933186
  %is.boolean = or i1 %is.false, %is.true
  br i1 %is.boolean, label %boolean, label %check.reference
check.reference:
  %is.object = icmp eq i64 %tag, 9221120237041090560
  %is.array = icmp eq i64 %tag, 9221401712017801216
  %is.reference = or i1 %is.object, %is.array
  br i1 %is.reference, label %object, label %number
null:
  br label %with.prefix
boolean:
  br label %with.prefix
number:
  br label %with.prefix
with.prefix:
  %prefix.ptr = phi ptr [ @.iter.msg.prefix.object, %null ], [ @.iter.msg.prefix.boolean, %boolean ], [ @.iter.msg.prefix.number, %number ]
  %prefix.len = phi i64 [ 7, %null ], [ 8, %boolean ], [ 7, %number ]
  %prefixed.ptr = call ptr @strConcat(i64 %prefix.len, ptr %prefix.ptr, i64 %raw.len, ptr %raw.ptr)
  %prefixed.len = add i64 %prefix.len, %raw.len
  br label %append.suffix
without.prefix:
  br label %append.suffix
append.suffix:
  %base.ptr = phi ptr [ %prefixed.ptr, %with.prefix ], [ %raw.ptr, %without.prefix ]
  %base.len = phi i64 [ %prefixed.len, %with.prefix ], [ %raw.len, %without.prefix ]
  %message.ptr = call ptr @strConcat(i64 %base.len, ptr %base.ptr, i64 18, ptr @.iter.msg.not.fn)
  %message.len = add i64 %base.len, 18
  %message = call i64 @valueBoxString(ptr %message.ptr, i64 %message.len)
  ret i64 %message
string:
  %quoted.ptr = call ptr @strConcat(i64 8, ptr @.iter.msg.prefix.string, i64 %raw.len, ptr %raw.ptr)
  %quoted.len = add i64 %raw.len, 8
  %string.message.ptr = call ptr @strConcat(i64 %quoted.len, ptr %quoted.ptr, i64 19, ptr @.iter.msg.quoted.not.fn)
  %string.message.len = add i64 %quoted.len, 19
  %string.message = call i64 @valueBoxString(ptr %string.message.ptr, i64 %string.message.len)
  ret i64 %string.message
object:
  %object.message = call i64 @valueBoxString(ptr @.iter.msg.object.not.fn, i64 24)
  ret i64 %object.message
}

define i64 @iteratorResultNotObjectMessage(i64 %value) {
entry:
  %raw = call { ptr, i64 } @valueToString(i64 %value)
  %raw.ptr = extractvalue { ptr, i64 } %raw, 0
  %raw.len = extractvalue { ptr, i64 } %raw, 1
  %prefixed.ptr = call ptr @strConcat(i64 16, ptr @.iter.msg.result.prefix, i64 %raw.len, ptr %raw.ptr)
  %prefixed.len = add i64 %raw.len, 16
  %message.ptr = call ptr @strConcat(i64 %prefixed.len, ptr %prefixed.ptr, i64 17, ptr @.iter.msg.not.object)
  %message.len = add i64 %prefixed.len, 17
  %message = call i64 @valueBoxString(ptr %message.ptr, i64 %message.len)
  ret i64 %message
}

define i64 @iteratorEntryNotObjectMessage(i64 %value) {
entry:
  %raw = call { ptr, i64 } @valueToString(i64 %value)
  %raw.ptr = extractvalue { ptr, i64 } %raw, 0
  %raw.len = extractvalue { ptr, i64 } %raw, 1
  %prefixed.ptr = call ptr @strConcat(i64 15, ptr @.iter.msg.entry.prefix, i64 %raw.len, ptr %raw.ptr)
  %prefixed.len = add i64 %raw.len, 15
  %message.ptr = call ptr @strConcat(i64 %prefixed.len, ptr %prefixed.ptr, i64 23, ptr @.iter.msg.entry.suffix)
  %message.len = add i64 %prefixed.len, 23
  %message = call i64 @valueBoxString(ptr %message.ptr, i64 %message.len)
  ret i64 %message
}

define { i64, i1 } @callIteratorNext(i64 %iterator) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterator)
  %is.object = call i1 @valueIsObject(i64 %iterator)
  br i1 %is.object, label %lookup, label %result.not.object
lookup:
  %next = call i64 @valueObjectGet(i64 %iterator, i64 4, ptr @.iter.key.next)
  call void @gcRootPush(i64 %next)
  %is.fn = call i1 @valueIsFunction(i64 %next)
  br i1 %is.fn, label %call.next, label %next.not.fn
call.next:
  %argv = alloca i64, i64 0
  %call = call { i64, i1 } @jsCall(i64 %next, i64 0, ptr %argv, i64 %iterator)
  %call.payload = extractvalue { i64, i1 } %call, 0
  %call.exc = extractvalue { i64, i1 } %call, 1
  call void @gcRootPush(i64 %call.payload)
  br i1 %call.exc, label %propagate, label %check.result
propagate:
  %prop.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %prop.1 = insertvalue { i64, i1 } %prop.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %prop.1
check.result:
  %res.is.object = call i1 @valueIsObject(i64 %call.payload)
  br i1 %res.is.object, label %success, label %result.not.object
success:
  %ok.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
next.not.fn:
  %msg.nn = call i64 @iteratorNotCallableMessage(i64 %next)
  %next.not.fn.error = call { i64, i1 } @iteratorTypeError(i64 %msg.nn)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %next.not.fn.error
result.not.object:
  %invalid.result = phi i64 [ %iterator, %entry ], [ %call.payload, %check.result ]
  %msg.rno = call i64 @iteratorResultNotObjectMessage(i64 %invalid.result)
  %result.not.object.error = call { i64, i1 } @iteratorTypeError(i64 %msg.rno)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result.not.object.error
}
define { i64, i1 } @iteratorClose(i64 %iterator) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %iterator)
  %return.method = call i64 @valuePropertyGet(i64 %iterator, i64 6, ptr @.iter.key.return)
  call void @gcRootPush(i64 %return.method)
  %is.undefined = icmp eq i64 %return.method, 9222246136947933184
  br i1 %is.undefined, label %absent, label %check.null
check.null:
  %is.null = icmp eq i64 %return.method, 9222246136947933187
  br i1 %is.null, label %absent, label %check.callable
absent:
  %abs.0 = insertvalue { i64, i1 } undef, i64 9222246136947933184, 0
  %abs.1 = insertvalue { i64, i1 } %abs.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %abs.1
check.callable:
  %is.fn = call i1 @valueIsFunction(i64 %return.method)
  br i1 %is.fn, label %call.return, label %not.callable
call.return:
  %argv = alloca i64, i64 0
  %call = call { i64, i1 } @jsCall(i64 %return.method, i64 0, ptr %argv, i64 %iterator)
  %call.payload = extractvalue { i64, i1 } %call, 0
  %call.exc = extractvalue { i64, i1 } %call, 1
  call void @gcRootPush(i64 %call.payload)
  br i1 %call.exc, label %propagate, label %check.result
propagate:
  %prop.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %prop.1 = insertvalue { i64, i1 } %prop.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %prop.1
check.result:
  %res.is.object = call i1 @valueIsObject(i64 %call.payload)
  br i1 %res.is.object, label %success, label %result.not.object
success:
  %ok.0 = insertvalue { i64, i1 } undef, i64 %call.payload, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
not.callable:
  %msg.nc = call i64 @iteratorNotCallableMessage(i64 %return.method)
  %not.callable.error = call { i64, i1 } @iteratorTypeError(i64 %msg.nc)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %not.callable.error
result.not.object:
  %msg.rno = call i64 @iteratorResultNotObjectMessage(i64 %call.payload)
  %result.not.object.error = call { i64, i1 } @iteratorTypeError(i64 %msg.rno)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result.not.object.error
}
