define i64 @valueBoxFunction(ptr %function) {
entry:
  %bits = ptrtoint ptr %function to i64
  %payload = and i64 %bits, 281474976710655
  %value = or i64 %payload, 9221964661971222528
  ret i64 %value
}
define ptr @valueFunctionPtr(i64 %value) {
entry:
  %bits = and i64 %value, 281474976710655
  %ptr = inttoptr i64 %bits to ptr
  ret ptr %ptr
}
define i64 @functionObjectNew(ptr %code, ptr %env, i64 %boundThis, i64 %name.value, i64 %length) {
entry:
  %cell = call ptr @gcAlloc(i64 5, i64 64)
  %payload = getelementptr i8, ptr %cell, i64 8
  store ptr %code, ptr %payload
  %env.slot = getelementptr i8, ptr %payload, i64 8
  store ptr %env, ptr %env.slot
  %this.slot = getelementptr i8, ptr %payload, i64 16
  store i64 %boundThis, ptr %this.slot
  %prototype.slot = getelementptr i8, ptr %payload, i64 24
  store ptr null, ptr %prototype.slot
  %name.slot = getelementptr i8, ptr %payload, i64 32
  store i64 %name.value, ptr %name.slot
  %flags.slot = getelementptr i8, ptr %payload, i64 40
  store i64 0, ptr %flags.slot
  %length.slot = getelementptr i8, ptr %payload, i64 48
  store i64 %length, ptr %length.slot
  %properties.slot = getelementptr i8, ptr %payload, i64 56
  store ptr null, ptr %properties.slot
  %value = call i64 @valueBoxFunction(ptr %payload)
  ret i64 %value
}
@.call.not.function.msg = private unnamed_addr constant [24 x i8] c"value is not a function\00"
@.call.err.name = private unnamed_addr constant [10 x i8] c"TypeError\00"
define { i64, i1 } @jsCall(i64 %fn.value, i64 %argc, ptr %argv, i64 %callThis) {
entry:
  ; `jsCall` is the boundary where a JSValue becomes a function pointer. A non-function value
  ; has a null payload, so dispatching on it dereferenced null and killed the process; the
  ; language says it throws, and a throw is the answer a user can act on.
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %fn.value)
  call void @gcRootPush(i64 %callThis)
  %is.function = call i1 @valueIsFunction(i64 %fn.value)
  br i1 %is.function, label %dispatch, label %not.callable
not.callable:
  %message = call i64 @valueBoxString(ptr @.call.not.function.msg, i64 23)
  %error = call ptr @errorNew(i64 2, i64 9, ptr @.call.err.name, i64 %message)
  %error.value = call i64 @valueBoxObject(ptr %error)
  %thrown.0 = insertvalue { i64, i1 } undef, i64 %error.value, 0
  %thrown = insertvalue { i64, i1 } %thrown.0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %thrown
dispatch:
  %function = call ptr @valueFunctionPtr(i64 %fn.value)
  %code = load ptr, ptr %function
  %env.slot = getelementptr i8, ptr %function, i64 8
  %env = load ptr, ptr %env.slot
  %this.slot = getelementptr i8, ptr %function, i64 16
  %boundThis = load i64, ptr %this.slot
  %has.bound.this = icmp ne i64 %boundThis, 9222246136947933184
  %this.value = select i1 %has.bound.this, i64 %boundThis, i64 %callThis
  %result = call { i64, i1 } %code(i64 %argc, ptr %argv, ptr %env, i64 %this.value)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result
}
@.function.name.key = private unnamed_addr constant [5 x i8] c"name\00"
@.function.length.key = private unnamed_addr constant [7 x i8] c"length\00"
@.function.prototype.key = private unnamed_addr constant [10 x i8] c"prototype\00"
@.function.constructor.key = private unnamed_addr constant [12 x i8] c"constructor\00"
@.function.empty.name = private unnamed_addr constant [1 x i8] c"\00"
define i64 @functionObjectGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %function.ptr = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot = getelementptr i8, ptr %function.ptr, i64 40
  %flags = load i64, ptr %flags.slot
  %is.name.length = icmp eq i64 %key.len, 4
  br i1 %is.name.length, label %name.compare, label %check.length
name.compare:
  %name.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.name.key, i64 4)
  %is.name = icmp eq i32 %name.cmp, 0
  br i1 %is.name, label %name.load, label %missing
name.load:
  ; A deleted own name falls back to Function.prototype.name, which is "".
  %name.deleted.bit = and i64 %flags, 1
  %name.deleted = icmp ne i64 %name.deleted.bit, 0
  br i1 %name.deleted, label %name.empty, label %name.read
name.read:
  %name.slot = getelementptr i8, ptr %function.ptr, i64 32
  %name = load i64, ptr %name.slot
  %name.missing = icmp eq i64 %name, 9222246136947933184
  br i1 %name.missing, label %name.empty, label %name.found
name.empty:
  %empty.name = call i64 @valueBoxString(ptr @.function.empty.name, i64 0)
  ret i64 %empty.name
name.found:
  ret i64 %name
check.length:
  %is.length.length = icmp eq i64 %key.len, 6
  br i1 %is.length.length, label %length.compare, label %missing
length.compare:
  %length.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.length.key, i64 6)
  %is.length = icmp eq i32 %length.cmp, 0
  br i1 %is.length, label %length.load, label %missing
length.load:
  ; A deleted own length falls back to Function.prototype.length, which is 0.
  %length.deleted.bit = and i64 %flags, 2
  %length.deleted = icmp ne i64 %length.deleted.bit, 0
  br i1 %length.deleted, label %length.zero, label %length.read
length.read:
  %length.slot = getelementptr i8, ptr %function.ptr, i64 48
  %length.i = load i64, ptr %length.slot
  %length.d = uitofp i64 %length.i to double
  %length.boxed = call i64 @valueBoxNumber(double %length.d)
  ret i64 %length.boxed
length.zero:
  %zero.boxed = call i64 @valueBoxNumber(double 0.0)
  ret i64 %zero.boxed
missing:
  %missing.ptr = call ptr @valueFunctionPtr(i64 %value)
  %missing.properties.slot = getelementptr i8, ptr %missing.ptr, i64 56
  %missing.properties = load ptr, ptr %missing.properties.slot
  %has.properties = icmp ne ptr %missing.properties, null
  br i1 %has.properties, label %missing.named, label %missing.proto
missing.named:
  %missing.value = call i64 @objectGet(ptr %missing.properties, i64 %key.len, ptr %key.ptr)
  %named.found = icmp ne i64 %missing.value, 9222246136947933184
  br i1 %named.found, label %missing.named.hit, label %missing.proto
missing.named.hit:
  ret i64 %missing.value
missing.proto:
  %is.proto.len = icmp eq i64 %key.len, 9
  br i1 %is.proto.len, label %missing.proto.cmp, label %missing.fnproto
missing.proto.cmp:
  %proto.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.prototype.key, i64 9)
  %is.proto = icmp eq i32 %proto.cmp, 0
  br i1 %is.proto, label %missing.create.proto, label %missing.fnproto
missing.create.proto:
  %pframe = call i64 @gcRootSave()
  call void @gcRootPush(i64 %value)
  %new.proto = call ptr @objectNew(i64 1)
  %new.proto.v = call i64 @valueBoxObject(ptr %new.proto)
  call void @gcRootPush(i64 %new.proto.v)
  call void @objectDefineDataProperty(ptr %new.proto, i64 11, ptr @.function.constructor.key, i64 %value, i64 5)
  %fn.props = call ptr @functionObjectProperties(i64 %value)
  call void @objectDefineDataProperty(ptr %fn.props, i64 9, ptr @.function.prototype.key, i64 %new.proto.v, i64 1)
  call void @gcRootRestore(i64 %pframe)
  ret i64 %new.proto.v
missing.fnproto:
  %proto.value = call i64 @functionPrototypeMethod(i64 %key.len, ptr %key.ptr)
  ret i64 %proto.value
}
define i1 @functionObjectHasOwn(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.name.length = icmp eq i64 %key.len, 4
  br i1 %is.name.length, label %name.compare, label %check.length
name.compare:
  %name.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.name.key, i64 4)
  %is.name = icmp eq i32 %name.cmp, 0
  br i1 %is.name, label %name.flags, label %missing
name.flags:
  %function.ptr = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot = getelementptr i8, ptr %function.ptr, i64 40
  %flags = load i64, ptr %flags.slot
  %name.deleted.bit = and i64 %flags, 1
  %name.present = icmp eq i64 %name.deleted.bit, 0
  ret i1 %name.present
check.length:
  %is.length.length = icmp eq i64 %key.len, 6
  br i1 %is.length.length, label %length.compare, label %missing
length.compare:
  %length.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.length.key, i64 6)
  %is.length = icmp eq i32 %length.cmp, 0
  br i1 %is.length, label %length.flags, label %missing
length.flags:
  %function.ptr.l = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot.l = getelementptr i8, ptr %function.ptr.l, i64 40
  %flags.l = load i64, ptr %flags.slot.l
  %length.deleted.bit = and i64 %flags.l, 2
  %length.present = icmp eq i64 %length.deleted.bit, 0
  ret i1 %length.present
missing:
  %missing.ptr = call ptr @valueFunctionPtr(i64 %value)
  %missing.properties.slot = getelementptr i8, ptr %missing.ptr, i64 56
  %missing.properties = load ptr, ptr %missing.properties.slot
  %has.properties = icmp ne ptr %missing.properties, null
  br i1 %has.properties, label %missing.named, label %missing.absent
missing.named:
  %missing.own = call i1 @objectHasOwn(ptr %missing.properties, i64 %key.len, ptr %key.ptr)
  ret i1 %missing.own
missing.absent:
  ret i1 false
}
define void @functionObjectDelete(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %function.ptr = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot = getelementptr i8, ptr %function.ptr, i64 40
  %is.name.length = icmp eq i64 %key.len, 4
  br i1 %is.name.length, label %name.compare, label %check.length
name.compare:
  %name.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.name.key, i64 4)
  %is.name = icmp eq i32 %name.cmp, 0
  br i1 %is.name, label %name.delete, label %done
name.delete:
  %name.flags = load i64, ptr %flags.slot
  %name.flags.next = or i64 %name.flags, 1
  store i64 %name.flags.next, ptr %flags.slot
  ret void
check.length:
  %is.length.length = icmp eq i64 %key.len, 6
  br i1 %is.length.length, label %length.compare, label %done
length.compare:
  %length.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.length.key, i64 6)
  %is.length = icmp eq i32 %length.cmp, 0
  br i1 %is.length, label %length.delete, label %done
length.delete:
  %length.flags = load i64, ptr %flags.slot
  %length.flags.next = or i64 %length.flags, 2
  store i64 %length.flags.next, ptr %flags.slot
  ret void
done:
  %done.properties.slot = getelementptr i8, ptr %function.ptr, i64 56
  %done.properties = load ptr, ptr %done.properties.slot
  %done.has.properties = icmp ne ptr %done.properties, null
  br i1 %done.has.properties, label %done.named, label %done.exit
done.named:
  call void @objectDelete(ptr %done.properties, i64 %key.len, ptr %key.ptr)
  ret void
done.exit:
  ret void
}
@.function.set.readonly = private unnamed_addr constant [36 x i8] c"Cannot assign to read only property\00"
define ptr @functionObjectProperties(i64 %value) {
entry:
  %function.ptr = call ptr @valueFunctionPtr(i64 %value)
  %properties.slot = getelementptr i8, ptr %function.ptr, i64 56
  %properties = load ptr, ptr %properties.slot
  %missing = icmp eq ptr %properties, null
  br i1 %missing, label %create, label %done
create:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %value)
  %created = call ptr @objectNew(i64 0)
  call void @gcRootRestore(i64 %frame)
  store ptr %created, ptr %properties.slot
  br label %done
done:
  %result = phi ptr [ %properties, %entry ], [ %created, %create ]
  ret ptr %result
}
define { i64, i1 } @functionObjectSet(i64 %value, i64 %key.len, ptr %key.ptr, i64 %stored) {
entry:
  %is.name.length = icmp eq i64 %key.len, 4
  br i1 %is.name.length, label %name.compare, label %check.length
name.compare:
  %name.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.name.key, i64 4)
  %is.name = icmp eq i32 %name.cmp, 0
  br i1 %is.name, label %readonly, label %store
check.length:
  %is.length.length = icmp eq i64 %key.len, 6
  br i1 %is.length.length, label %length.compare, label %store
length.compare:
  %length.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.length.key, i64 6)
  %is.length = icmp eq i32 %length.cmp, 0
  br i1 %is.length, label %readonly, label %store
readonly:
  %message = call i64 @valueBoxString(ptr @.function.set.readonly, i64 35)
  %error = call { i64, i1 } @iteratorTypeError(i64 %message)
  ret { i64, i1 } %error
store:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %value)
  call void @gcRootPush(i64 %stored)
  %properties = call ptr @functionObjectProperties(i64 %value)
  %set.result = call { i64, i1 } @objectPropertySetWithThis(ptr %properties, i64 %value, i64 %key.len, ptr %key.ptr, i64 %stored)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %set.result
}

define void @functionObjectAttachProperties(i64 %fn.value, i64 %properties.value) {
entry:
  %fn.ptr = call ptr @valueFunctionPtr(i64 %fn.value)
  %props.ptr = call ptr @valueObjectPtr(i64 %properties.value)
  %props.slot = getelementptr i8, ptr %fn.ptr, i64 56
  store ptr %props.ptr, ptr %props.slot
  ret void
}

define { i64, i1 } @functionObjectPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.name.length = icmp eq i64 %key.len, 4
  br i1 %is.name.length, label %check.name, label %check.length
check.name:
  %name.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.name.key, i64 4)
  %is.name = icmp eq i32 %name.cmp, 0
  br i1 %is.name, label %builtin.read, label %check.props
check.length:
  %is.length.length = icmp eq i64 %key.len, 6
  br i1 %is.length.length, label %check.length.cmp, label %check.props
check.length.cmp:
  %length.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.length.key, i64 6)
  %is.length = icmp eq i32 %length.cmp, 0
  br i1 %is.length, label %builtin.read, label %check.props
builtin.read:
  %builtin.val = call i64 @functionObjectGet(i64 %value, i64 %key.len, ptr %key.ptr)
  %b.0 = insertvalue { i64, i1 } undef, i64 %builtin.val, 0
  %b.1 = insertvalue { i64, i1 } %b.0, i1 false, 1
  ret { i64, i1 } %b.1
check.props:
  %fn.ptr = call ptr @valueFunctionPtr(i64 %value)
  %props.slot = getelementptr i8, ptr %fn.ptr, i64 56
  %props = load ptr, ptr %props.slot
  %has.props = icmp ne ptr %props, null
  br i1 %has.props, label %read.props, label %check.proto
read.props:
  %prop.res = call { i64, i1 } @objectPropertyGetWithThis(ptr %props, i64 %value, i64 %key.len, ptr %key.ptr)
  %prop.threw = extractvalue { i64, i1 } %prop.res, 1
  br i1 %prop.threw, label %prop.done, label %check.prop.val
check.prop.val:
  %prop.val = extractvalue { i64, i1 } %prop.res, 0
  %prop.found = icmp ne i64 %prop.val, 9222246136947933184
  br i1 %prop.found, label %prop.done, label %check.proto
prop.done:
  ret { i64, i1 } %prop.res
check.proto:
  %proto.fn = call i64 @functionPrototypeMethod(i64 %key.len, ptr %key.ptr)
  %p.0 = insertvalue { i64, i1 } undef, i64 %proto.fn, 0
  %p.1 = insertvalue { i64, i1 } %p.0, i1 false, 1
  ret { i64, i1 } %p.1
}
define i64 @functionObjectOwnPropertyDescriptor(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.name.length = icmp eq i64 %key.len, 4
  br i1 %is.name.length, label %name.compare, label %check.length
name.compare:
  %name.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.name.key, i64 4)
  %is.name = icmp eq i32 %name.cmp, 0
  br i1 %is.name, label %name.flags, label %missing
name.flags:
  %function.ptr = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot = getelementptr i8, ptr %function.ptr, i64 40
  %flags = load i64, ptr %flags.slot
  %name.deleted.bit = and i64 %flags, 1
  %name.deleted = icmp ne i64 %name.deleted.bit, 0
  br i1 %name.deleted, label %missing, label %name.value
name.value:
  %name.slot = getelementptr i8, ptr %function.ptr, i64 32
  %name.stored = load i64, ptr %name.slot
  %name.missing = icmp eq i64 %name.stored, 9222246136947933184
  br i1 %name.missing, label %name.empty, label %name.describe
name.empty:
  %name.empty.value = call i64 @valueBoxString(ptr @.function.empty.name, i64 0)
  br label %name.describe
name.describe:
  %name.value.final = phi i64 [ %name.stored, %name.value ], [ %name.empty.value, %name.empty ]
  %name.desc = call ptr @objectNew(i64 4)
  call void @objectSet(ptr %name.desc, i64 5, ptr @.desc.value, i64 %name.value.final)
  call void @objectSet(ptr %name.desc, i64 8, ptr @.desc.writable, i64 9222246136947933185)
  call void @objectSet(ptr %name.desc, i64 10, ptr @.desc.enumerable, i64 9222246136947933185)
  call void @objectSet(ptr %name.desc, i64 12, ptr @.desc.configurable, i64 9222246136947933186)
  %name.boxed = call i64 @valueBoxObject(ptr %name.desc)
  ret i64 %name.boxed
check.length:
  %is.length.length = icmp eq i64 %key.len, 6
  br i1 %is.length.length, label %length.compare, label %missing
length.compare:
  %length.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.function.length.key, i64 6)
  %is.length = icmp eq i32 %length.cmp, 0
  br i1 %is.length, label %length.flags, label %missing
length.flags:
  %function.ptr.l = call ptr @valueFunctionPtr(i64 %value)
  %flags.slot.l = getelementptr i8, ptr %function.ptr.l, i64 40
  %flags.l = load i64, ptr %flags.slot.l
  %length.deleted.bit = and i64 %flags.l, 2
  %length.deleted = icmp ne i64 %length.deleted.bit, 0
  br i1 %length.deleted, label %missing, label %length.value
length.value:
  %length.slot = getelementptr i8, ptr %function.ptr.l, i64 48
  %length.i = load i64, ptr %length.slot
  %length.d = uitofp i64 %length.i to double
  %length.boxed = call i64 @valueBoxNumber(double %length.d)
  %length.desc = call ptr @objectNew(i64 4)
  call void @objectSet(ptr %length.desc, i64 5, ptr @.desc.value, i64 %length.boxed)
  call void @objectSet(ptr %length.desc, i64 8, ptr @.desc.writable, i64 9222246136947933185)
  call void @objectSet(ptr %length.desc, i64 10, ptr @.desc.enumerable, i64 9222246136947933185)
  call void @objectSet(ptr %length.desc, i64 12, ptr @.desc.configurable, i64 9222246136947933186)
  %length.desc.boxed = call i64 @valueBoxObject(ptr %length.desc)
  ret i64 %length.desc.boxed
missing:
  %missing.ptr = call ptr @valueFunctionPtr(i64 %value)
  %missing.properties.slot = getelementptr i8, ptr %missing.ptr, i64 56
  %missing.properties = load ptr, ptr %missing.properties.slot
  %has.properties = icmp ne ptr %missing.properties, null
  br i1 %has.properties, label %missing.named, label %missing.undefined
missing.named:
  %missing.desc = call i64 @objectOwnPropertyDescriptor(ptr %missing.properties, i64 %key.len, ptr %key.ptr)
  ret i64 %missing.desc
missing.undefined:
  ret i64 9222246136947933184
}

@.function.proto.name.call = private unnamed_addr constant [5 x i8] c"call\00"
@.function.proto.name.apply = private unnamed_addr constant [6 x i8] c"apply\00"
@.function.proto.name.bind = private unnamed_addr constant [5 x i8] c"bind\00"
@.function.proto.name.toString = private unnamed_addr constant [9 x i8] c"toString\00"
@.function.proto.not.fn = private unnamed_addr constant [59 x i8] c"Function.prototype method called on a value not a function\00"
@.function.proto.apply.args = private unnamed_addr constant [45 x i8] c"CreateListFromArrayLike called on non-object\00"
@.function.bound.prefix = private unnamed_addr constant [7 x i8] c"bound \00"
@.function.tostring.prefix = private unnamed_addr constant [10 x i8] c"function \00"
@.function.tostring.suffix = private unnamed_addr constant [21 x i8] c"() { [native code] }\00"

@functionPrototypeMethods = private unnamed_addr constant [4 x { i64, ptr, ptr, i64 }] [
  { i64, ptr, ptr, i64 } { i64 4, ptr @.function.proto.name.call, ptr @functionProtoCall, i64 1 },
  { i64, ptr, ptr, i64 } { i64 5, ptr @.function.proto.name.apply, ptr @functionProtoApply, i64 2 },
  { i64, ptr, ptr, i64 } { i64 4, ptr @.function.proto.name.bind, ptr @functionProtoBind, i64 1 },
  { i64, ptr, ptr, i64 } { i64 8, ptr @.function.proto.name.toString, ptr @functionProtoToString, i64 0 }
]

@functionPrototypeFunctions = private global [4 x i64] zeroinitializer

define void @functionPrototypeInit() {
entry:
  br label %loop
loop:
  %index = phi i64 [ 0, %entry ], [ %next, %body ]
  %done = icmp eq i64 %index, 4
  br i1 %done, label %finish, label %body
body:
  %slot = getelementptr [4 x i64], ptr @functionPrototypeFunctions, i64 0, i64 %index
  store i64 0, ptr %slot
  call void @gcRegisterGlobalRoot(ptr %slot)
  %next = add i64 %index, 1
  br label %loop
finish:
  ret void
}

define i64 @functionPrototypeMethod(i64 %key.len, ptr %key.ptr) {
entry:
  br label %scan
scan:
  %index = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %index, 4
  br i1 %done, label %missing, label %check.length
check.length:
  %length.slot = getelementptr [4 x { i64, ptr, ptr, i64 }], ptr @functionPrototypeMethods, i64 0, i64 %index, i32 0
  %length = load i64, ptr %length.slot
  %same.length = icmp eq i64 %length, %key.len
  br i1 %same.length, label %check.name, label %advance
check.name:
  %name.slot = getelementptr [4 x { i64, ptr, ptr, i64 }], ptr @functionPrototypeMethods, i64 0, i64 %index, i32 1
  %name = load ptr, ptr %name.slot
  %cmp = call i32 @memcmp(ptr %key.ptr, ptr %name, i64 %key.len)
  %same.name = icmp eq i32 %cmp, 0
  br i1 %same.name, label %found, label %advance
found:
  %cache.slot = getelementptr [4 x i64], ptr @functionPrototypeFunctions, i64 0, i64 %index
  %cached = load i64, ptr %cache.slot
  %uninit = icmp eq i64 %cached, 0
  br i1 %uninit, label %create, label %reuse
reuse:
  ret i64 %cached
create:
  %method.slot = getelementptr [4 x { i64, ptr, ptr, i64 }], ptr @functionPrototypeMethods, i64 0, i64 %index, i32 2
  %method = load ptr, ptr %method.slot
  %arity.slot = getelementptr [4 x { i64, ptr, ptr, i64 }], ptr @functionPrototypeMethods, i64 0, i64 %index, i32 3
  %arity = load i64, ptr %arity.slot
  %name.value = call i64 @valueBoxString(ptr %name, i64 %length)
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %name.value)
  %fn = call i64 @functionObjectNew(ptr %method, ptr null, i64 9222246136947933184, i64 %name.value, i64 %arity)
  store i64 %fn, ptr %cache.slot
  call void @gcRootRestore(i64 %frame)
  ret i64 %fn
advance:
  %next = add i64 %index, 1
  br label %scan
missing:
  ret i64 9222246136947933184
}

define { i64, i1 } @functionProtoReceiverError() {
entry:
  %msg = call i64 @valueBoxString(ptr @.function.proto.not.fn, i64 58)
  %err = call { i64, i1 } @iteratorTypeError(i64 %msg)
  ret { i64, i1 } %err
}

define { i64, i1 } @functionProtoCall(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.fn = call i1 @valueIsFunction(i64 %this.value)
  br i1 %is.fn, label %dispatch, label %not.fn
not.fn:
  %err = call { i64, i1 } @functionProtoReceiverError()
  ret { i64, i1 } %err
dispatch:
  %has.this = icmp uge i64 %argc, 1
  br i1 %has.this, label %load.this, label %no.this
load.this:
  %bound.this = load i64, ptr %argv
  %call.argc = sub i64 %argc, 1
  %has.args = icmp ugt i64 %call.argc, 0
  %args.ptr = getelementptr i64, ptr %argv, i64 1
  %call.argv = select i1 %has.args, ptr %args.ptr, ptr null
  %res1 = call { i64, i1 } @jsCall(i64 %this.value, i64 %call.argc, ptr %call.argv, i64 %bound.this)
  ret { i64, i1 } %res1
no.this:
  %res0 = call { i64, i1 } @jsCall(i64 %this.value, i64 0, ptr null, i64 9222246136947933184)
  ret { i64, i1 } %res0
}

define { i64, i1 } @functionProtoApply(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %is.fn = call i1 @valueIsFunction(i64 %this.value)
  br i1 %is.fn, label %read.args, label %not.fn
not.fn:
  %err = call { i64, i1 } @functionProtoReceiverError()
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %err
read.args:
  %has.this = icmp uge i64 %argc, 1
  br i1 %has.this, label %load.this, label %empty.call
load.this:
  %call.this = load i64, ptr %argv
  call void @gcRootPush(i64 %call.this)
  %has.list = icmp uge i64 %argc, 2
  br i1 %has.list, label %load.list, label %invoke.empty
empty.call:
  br label %invoke.empty
invoke.empty:
  %empty.this = phi i64 [ 9222246136947933184, %empty.call ], [ %call.this, %load.this ]
  %empty.res = call { i64, i1 } @jsCall(i64 %this.value, i64 0, ptr null, i64 %empty.this)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %empty.res
load.list:
  %list.slot = getelementptr i64, ptr %argv, i64 1
  %list.val = load i64, ptr %list.slot
  call void @gcRootPush(i64 %list.val)
  %is.undef = icmp eq i64 %list.val, 9222246136947933184
  %is.null = icmp eq i64 %list.val, 9222246136947933187
  %is.nullish = or i1 %is.undef, %is.null
  br i1 %is.nullish, label %nullish.call, label %check.array
nullish.call:
  %nullish.res = call { i64, i1 } @jsCall(i64 %this.value, i64 0, ptr null, i64 %call.this)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %nullish.res
check.array:
  %is.array = call i1 @valueIsArray(i64 %list.val)
  br i1 %is.array, label %from.array, label %check.object
from.array:
  %arr.ptr = call ptr @valueArrayPtr(i64 %list.val)
  %arr.len = call i64 @arrayLength(ptr %arr.ptr)
  %arr.empty = icmp eq i64 %arr.len, 0
  br i1 %arr.empty, label %nullish.call, label %copy.array
copy.array:
  %arr.bytes = mul i64 %arr.len, 8
  %arr.buf = call ptr @malloc(i64 %arr.bytes)
  br label %copy.array.loop
copy.array.loop:
  %ai = phi i64 [ 0, %copy.array ], [ %ai.next, %copy.array.body ]
  %ai.done = icmp eq i64 %ai, %arr.len
  br i1 %ai.done, label %invoke.buf, label %copy.array.body
copy.array.body:
  %elem = call i64 @arrayGet(ptr %arr.ptr, i64 %ai)
  call void @gcRootPush(i64 %elem)
  %dst.slot = getelementptr i64, ptr %arr.buf, i64 %ai
  store i64 %elem, ptr %dst.slot
  %ai.next = add i64 %ai, 1
  br label %copy.array.loop
check.object:
  %is.obj = call i1 @valueIsObject(i64 %list.val)
  br i1 %is.obj, label %from.object, label %bad.list
bad.list:
  %bad.msg = call i64 @valueBoxString(ptr @.function.proto.apply.args, i64 44)
  %bad.err = call { i64, i1 } @iteratorTypeError(i64 %bad.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %bad.err
from.object:
  %len.res = call { i64, i1 } @checkedValuePropertyGet(i64 %list.val, i64 6, ptr @.function.length.key)
  %len.threw = extractvalue { i64, i1 } %len.res, 1
  br i1 %len.threw, label %len.fail, label %len.ok
len.fail:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %len.res
len.ok:
  %len.val = extractvalue { i64, i1 } %len.res, 0
  %len.num = call double @valueToNumber(i64 %len.val)
  %len.raw = call i64 @numberToIndex(double %len.num)
  %len.neg = icmp sle i64 %len.raw, 0
  br i1 %len.neg, label %nullish.call, label %copy.object
copy.object:
  %obj.bytes = mul i64 %len.raw, 8
  %obj.buf = call ptr @malloc(i64 %obj.bytes)
  br label %copy.object.loop
copy.object.loop:
  %oi = phi i64 [ 0, %copy.object ], [ %oi.next, %copy.object.body ]
  %oi.done = icmp eq i64 %oi, %len.raw
  br i1 %oi.done, label %invoke.buf, label %copy.object.body
copy.object.body:
  %oelem = call i64 @valueArrayGet(i64 %list.val, i64 %oi, i64 0, ptr null)
  call void @gcRootPush(i64 %oelem)
  %odst = getelementptr i64, ptr %obj.buf, i64 %oi
  store i64 %oelem, ptr %odst
  %oi.next = add i64 %oi, 1
  br label %copy.object.loop
invoke.buf:
  %final.buf = phi ptr [ %arr.buf, %copy.array.loop ], [ %obj.buf, %copy.object.loop ]
  %final.len = phi i64 [ %arr.len, %copy.array.loop ], [ %len.raw, %copy.object.loop ]
  %call.res = call { i64, i1 } @jsCall(i64 %this.value, i64 %final.len, ptr %final.buf, i64 %call.this)
  call void @free(ptr %final.buf)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %call.res
}

define { i64, i1 } @functionBoundTrampoline(i64 %argc, ptr %argv, ptr %env, i64 %call.this) {
entry:
  %frame = call i64 @gcRootSave()
  %env.count = load i64, ptr %env
  %slots.ptr = getelementptr i8, ptr %env, i64 8
  %slots = load ptr, ptr %slots.ptr
  %target.fn = load i64, ptr %slots
  %bound.this.slot = getelementptr i64, ptr %slots, i64 1
  %bound.this = load i64, ptr %bound.this.slot
  call void @gcRootPush(i64 %target.fn)
  call void @gcRootPush(i64 %bound.this)
  %bound.argc = sub i64 %env.count, 2
  %total.argc = add i64 %bound.argc, %argc
  %empty = icmp eq i64 %total.argc, 0
  br i1 %empty, label %invoke.empty, label %build.args
invoke.empty:
  %res0 = call { i64, i1 } @jsCall(i64 %target.fn, i64 0, ptr null, i64 %bound.this)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %res0
build.args:
  %total.bytes = mul i64 %total.argc, 8
  %buf = call ptr @malloc(i64 %total.bytes)
  br label %copy.bound
copy.bound:
  %bi = phi i64 [ 0, %build.args ], [ %bi.next, %copy.bound.body ]
  %bi.done = icmp eq i64 %bi, %bound.argc
  br i1 %bi.done, label %copy.call, label %copy.bound.body
copy.bound.body:
  %src.idx = add i64 %bi, 2
  %src.slot = getelementptr i64, ptr %slots, i64 %src.idx
  %bval = load i64, ptr %src.slot
  call void @gcRootPush(i64 %bval)
  %bdst = getelementptr i64, ptr %buf, i64 %bi
  store i64 %bval, ptr %bdst
  %bi.next = add i64 %bi, 1
  br label %copy.bound
copy.call:
  %ci = phi i64 [ 0, %copy.bound ], [ %ci.next, %copy.call.body ]
  %ci.done = icmp eq i64 %ci, %argc
  br i1 %ci.done, label %invoke, label %copy.call.body
copy.call.body:
  %csrc = getelementptr i64, ptr %argv, i64 %ci
  %cval = load i64, ptr %csrc
  call void @gcRootPush(i64 %cval)
  %cdst.idx = add i64 %bound.argc, %ci
  %cdst = getelementptr i64, ptr %buf, i64 %cdst.idx
  store i64 %cval, ptr %cdst
  %ci.next = add i64 %ci, 1
  br label %copy.call
invoke:
  %res = call { i64, i1 } @jsCall(i64 %target.fn, i64 %total.argc, ptr %buf, i64 %bound.this)
  call void @free(ptr %buf)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %res
}

define { i64, i1 } @functionProtoBind(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %is.fn = call i1 @valueIsFunction(i64 %this.value)
  br i1 %is.fn, label %root.args, label %not.fn
not.fn:
  %err = call { i64, i1 } @functionProtoReceiverError()
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %err
root.args:
  br label %root.loop
root.loop:
  %ri = phi i64 [ 0, %root.args ], [ %ri.next, %root.body ]
  %ri.done = icmp eq i64 %ri, %argc
  br i1 %ri.done, label %setup, label %root.body
root.body:
  %rslot = getelementptr i64, ptr %argv, i64 %ri
  %rval = load i64, ptr %rslot
  call void @gcRootPush(i64 %rval)
  %ri.next = add i64 %ri, 1
  br label %root.loop
setup:
  %has.this = icmp uge i64 %argc, 1
  br i1 %has.this, label %load.this, label %no.this
load.this:
  %arg.this = load i64, ptr %argv
  %arg.count = sub i64 %argc, 1
  br label %alloc.env
no.this:
  br label %alloc.env
alloc.env:
  %bound.this = phi i64 [ %arg.this, %load.this ], [ 9222246136947933184, %no.this ]
  %bound.argc = phi i64 [ %arg.count, %load.this ], [ 0, %no.this ]
  %env.count = add i64 %bound.argc, 2
  %bound.env = call ptr @environmentNew(i64 %env.count)
  %env.boxed = call i64 @valueBoxObject(ptr %bound.env)
  call void @gcRootPush(i64 %env.boxed)
  call void @environmentSet(ptr %bound.env, i64 0, i64 %this.value)
  call void @environmentSet(ptr %bound.env, i64 1, i64 %bound.this)
  br label %fill.env
fill.env:
  %fi = phi i64 [ 0, %alloc.env ], [ %fi.next, %fill.body ]
  %fi.done = icmp eq i64 %fi, %bound.argc
  br i1 %fi.done, label %metadata, label %fill.body
fill.body:
  %fsrc.idx = add i64 %fi, 1
  %fsrc = getelementptr i64, ptr %argv, i64 %fsrc.idx
  %fval = load i64, ptr %fsrc
  %fdst.idx = add i64 %fi, 2
  call void @environmentSet(ptr %bound.env, i64 %fdst.idx, i64 %fval)
  %fi.next = add i64 %fi, 1
  br label %fill.env
metadata:
  %orig.name.val = call i64 @functionObjectGet(i64 %this.value, i64 4, ptr @.function.name.key)
  call void @gcRootPush(i64 %orig.name.val)
  %orig.name.str = call { ptr, i64 } @valueToString(i64 %orig.name.val)
  %orig.name.ptr = extractvalue { ptr, i64 } %orig.name.str, 0
  %orig.name.len = extractvalue { ptr, i64 } %orig.name.str, 1
  %bound.name.bytes = call ptr @strConcat(i64 6, ptr @.function.bound.prefix, i64 %orig.name.len, ptr %orig.name.ptr)
  %bound.name.len = add i64 %orig.name.len, 6
  %bound.name = call i64 @valueBoxString(ptr %bound.name.bytes, i64 %bound.name.len)
  call void @gcRootPush(i64 %bound.name)
  %orig.len.val = call i64 @functionObjectGet(i64 %this.value, i64 6, ptr @.function.length.key)
  %orig.len.num = call double @valueToNumber(i64 %orig.len.val)
  %orig.len.i = call i64 @numberToIndex(double %orig.len.num)
  %has.rem = icmp sgt i64 %orig.len.i, %bound.argc
  %rem.len = sub i64 %orig.len.i, %bound.argc
  %final.len = select i1 %has.rem, i64 %rem.len, i64 0
  %bound.fn = call i64 @functionObjectNew(ptr @functionBoundTrampoline, ptr %bound.env, i64 %bound.this, i64 %bound.name, i64 %final.len)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %bound.fn, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
}

define { i64, i1 } @functionProtoToString(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %is.fn = call i1 @valueIsFunction(i64 %this.value)
  br i1 %is.fn, label %format, label %not.fn
not.fn:
  %err = call { i64, i1 } @functionProtoReceiverError()
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %err
format:
  %name.val = call i64 @functionObjectGet(i64 %this.value, i64 4, ptr @.function.name.key)
  call void @gcRootPush(i64 %name.val)
  %name.str = call { ptr, i64 } @valueToString(i64 %name.val)
  %name.ptr = extractvalue { ptr, i64 } %name.str, 0
  %name.len = extractvalue { ptr, i64 } %name.str, 1
  %prefix.cat = call ptr @strConcat(i64 9, ptr @.function.tostring.prefix, i64 %name.len, ptr %name.ptr)
  %prefix.len = add i64 9, %name.len
  %full.cat = call ptr @strConcat(i64 %prefix.len, ptr %prefix.cat, i64 20, ptr @.function.tostring.suffix)
  call void @free(ptr %prefix.cat)
  %full.len = add i64 %prefix.len, 20
  %str.val = call i64 @valueBoxString(ptr %full.cat, i64 %full.len)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %str.val, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok.1
}
