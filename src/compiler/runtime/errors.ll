@.error.key.name = private unnamed_addr constant [5 x i8] c"name\00"
@.error.key.message = private unnamed_addr constant [8 x i8] c"message\00"

define ptr @errorNew(i64 %class.id, i64 %name.len, ptr %name.ptr, i64 %message) {
entry:
  %object = call ptr @objectNew(i64 2)
  %class.slot = getelementptr i8, ptr %object, i64 48
  store i64 %class.id, ptr %class.slot
  %name.value = call i64 @valueBoxString(ptr %name.ptr, i64 %name.len)
  call void @objectDefineDataProperty(ptr %object, i64 4, ptr @.error.key.name, i64 %name.value, i64 5)
  call void @objectDefineDataProperty(ptr %object, i64 7, ptr @.error.key.message, i64 %message, i64 5)
  ret ptr %object
}
@.error.tostring.key.name = private unnamed_addr constant [5 x i8] c"name\00"
@.error.tostring.key.message = private unnamed_addr constant [8 x i8] c"message\00"

define { ptr, i64 } @errorToString(ptr %object) {
entry:
  %name.value = call i64 @objectGet(ptr %object, i64 4, ptr @.error.tostring.key.name)
  %name.str = call { ptr, i64 } @valueToString(i64 %name.value)
  %name.ptr = extractvalue { ptr, i64 } %name.str, 0
  %name.len = extractvalue { ptr, i64 } %name.str, 1
  %message.value = call i64 @objectGet(ptr %object, i64 7, ptr @.error.tostring.key.message)
  %message.str = call { ptr, i64 } @valueToString(i64 %message.value)
  %message.ptr = extractvalue { ptr, i64 } %message.str, 0
  %message.len = extractvalue { ptr, i64 } %message.str, 1
  %message.empty = icmp eq i64 %message.len, 0
  br i1 %message.empty, label %name.only, label %joined
name.only:
  ret { ptr, i64 } %name.str
joined:
  %prefix.len = add i64 %name.len, 2
  %total = add i64 %prefix.len, %message.len
  %alloc.len = add i64 %total, 1
  %buffer = call ptr @malloc(i64 %alloc.len)
  call ptr @memcpy(ptr %buffer, ptr %name.ptr, i64 %name.len)
  %colon.slot = getelementptr i8, ptr %buffer, i64 %name.len
  store i8 58, ptr %colon.slot
  %space.index = add i64 %name.len, 1
  %space.slot = getelementptr i8, ptr %buffer, i64 %space.index
  store i8 32, ptr %space.slot
  %message.slot = getelementptr i8, ptr %buffer, i64 %prefix.len
  call ptr @memcpy(ptr %message.slot, ptr %message.ptr, i64 %message.len)
  %nul.slot = getelementptr i8, ptr %buffer, i64 %total
  store i8 0, ptr %nul.slot
  %joined.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %joined.1 = insertvalue { ptr, i64 } %joined.0, i64 %total, 1
  ret { ptr, i64 } %joined.1
}

; Builtin error constructors as values. Each class id has one function object, created on first use
; and kept as a GC root, so `e.constructor === TypeError` compares the same object everywhere.
; Calling one, with or without `new`, creates an error of its class: an undefined message is empty,
; as `Error.prototype.message` is, and any other message is converted to a string.
@errorConstructorObjects = internal global [8 x i64] zeroinitializer
@.errorctor.empty = private unnamed_addr constant [1 x i8] c"\00"
@.errorctor.name.Error = private unnamed_addr constant [6 x i8] c"Error\00"
@.errorctor.name.TypeError = private unnamed_addr constant [10 x i8] c"TypeError\00"
@.errorctor.name.RangeError = private unnamed_addr constant [11 x i8] c"RangeError\00"
@.errorctor.name.EvalError = private unnamed_addr constant [10 x i8] c"EvalError\00"
@.errorctor.name.URIError = private unnamed_addr constant [9 x i8] c"URIError\00"
@.errorctor.name.SyntaxError = private unnamed_addr constant [12 x i8] c"SyntaxError\00"
@.errorctor.name.ReferenceError = private unnamed_addr constant [15 x i8] c"ReferenceError\00"
; { constructor code, name length, name bytes } by class id; id 0 is no error class.
@errorConstructorTable = private unnamed_addr constant [8 x { ptr, i64, ptr }] [
  { ptr, i64, ptr } { ptr null, i64 0, ptr null },
  { ptr, i64, ptr } { ptr @errorConstructorError, i64 5, ptr @.errorctor.name.Error },
  { ptr, i64, ptr } { ptr @errorConstructorTypeError, i64 9, ptr @.errorctor.name.TypeError },
  { ptr, i64, ptr } { ptr @errorConstructorRangeError, i64 10, ptr @.errorctor.name.RangeError },
  { ptr, i64, ptr } { ptr @errorConstructorEvalError, i64 9, ptr @.errorctor.name.EvalError },
  { ptr, i64, ptr } { ptr @errorConstructorURIError, i64 8, ptr @.errorctor.name.URIError },
  { ptr, i64, ptr } { ptr @errorConstructorSyntaxError, i64 11, ptr @.errorctor.name.SyntaxError },
  { ptr, i64, ptr } { ptr @errorConstructorReferenceError, i64 14, ptr @.errorctor.name.ReferenceError }
]

define i64 @errorConstructorValue(i64 %class.id) {
entry:
  %slot = getelementptr [8 x i64], ptr @errorConstructorObjects, i64 0, i64 %class.id
  %cached = load i64, ptr %slot
  %missing = icmp eq i64 %cached, 0
  br i1 %missing, label %create, label %done
create:
  %code.slot = getelementptr [8 x { ptr, i64, ptr }], ptr @errorConstructorTable, i64 0, i64 %class.id, i32 0
  %code = load ptr, ptr %code.slot
  %name.len.slot = getelementptr [8 x { ptr, i64, ptr }], ptr @errorConstructorTable, i64 0, i64 %class.id, i32 1
  %name.len = load i64, ptr %name.len.slot
  %name.ptr.slot = getelementptr [8 x { ptr, i64, ptr }], ptr @errorConstructorTable, i64 0, i64 %class.id, i32 2
  %name.ptr = load ptr, ptr %name.ptr.slot
  %name = call i64 @valueBoxString(ptr %name.ptr, i64 %name.len)
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %name)
  %constructor = call i64 @functionObjectNew(ptr %code, ptr null, i64 9222246136947933184, i64 %name, i64 1)
  call void @gcRootRestore(i64 %frame)
  store i64 %constructor, ptr %slot
  call void @gcRegisterGlobalRoot(ptr %slot)
  ret i64 %constructor
done:
  ret i64 %cached
}

; An error's message from the argument a constructor received: an undefined one is empty, as
; `Error.prototype.message` is, a string is kept, and anything else is converted to a string.
define i64 @errorMessageFrom(i64 %argument) {
entry:
  %undefined = icmp eq i64 %argument, 9222246136947933184
  br i1 %undefined, label %empty, label %check.string
check.string:
  %is.string = call i1 @valueIsString(i64 %argument)
  br i1 %is.string, label %kept, label %convert
kept:
  ret i64 %argument
convert:
  %converted = call { ptr, i64 } @valueToString(i64 %argument)
  %converted.ptr = extractvalue { ptr, i64 } %converted, 0
  %converted.len = extractvalue { ptr, i64 } %converted, 1
  %converted.value = call i64 @valueCopyString(ptr %converted.ptr, i64 %converted.len)
  ret i64 %converted.value
empty:
  %empty.value = call i64 @valueBoxString(ptr @.errorctor.empty, i64 0)
  ret i64 %empty.value
}

define { i64, i1 } @errorConstructorCall(i64 %class.id, i64 %argc, ptr %argv) {
entry:
  %has.message = icmp ugt i64 %argc, 0
  br i1 %has.message, label %load, label %create
load:
  %argument = load i64, ptr %argv
  br label %create
create:
  %raw.message = phi i64 [ %argument, %load ], [ 9222246136947933184, %entry ]
  %message = call i64 @errorMessageFrom(i64 %raw.message)
  %name.len.slot = getelementptr [8 x { ptr, i64, ptr }], ptr @errorConstructorTable, i64 0, i64 %class.id, i32 1
  %name.len = load i64, ptr %name.len.slot
  %name.ptr.slot = getelementptr [8 x { ptr, i64, ptr }], ptr @errorConstructorTable, i64 0, i64 %class.id, i32 2
  %name.ptr = load ptr, ptr %name.ptr.slot
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %message)
  %error = call ptr @errorNew(i64 %class.id, i64 %name.len, ptr %name.ptr, i64 %message)
  %error.value = call i64 @valueBoxObject(ptr %error)
  call void @gcRootPush(i64 %error.value)
  %has.options = icmp ugt i64 %argc, 1
  br i1 %has.options, label %options, label %done
options:
  %options.slot = getelementptr i64, ptr %argv, i64 1
  %options.value = load i64, ptr %options.slot
  call void @errorInstallCause(ptr %error, i64 %options.value)
  br label %done
done:
  call void @gcRootRestore(i64 %frame)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %error.value, 0
  %ok = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok
}
define { i64, i1 } @errorConstructorError(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %result = call { i64, i1 } @errorConstructorCall(i64 1, i64 %argc, ptr %argv)
  ret { i64, i1 } %result
}
define { i64, i1 } @errorConstructorTypeError(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %result = call { i64, i1 } @errorConstructorCall(i64 2, i64 %argc, ptr %argv)
  ret { i64, i1 } %result
}
define { i64, i1 } @errorConstructorRangeError(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %result = call { i64, i1 } @errorConstructorCall(i64 3, i64 %argc, ptr %argv)
  ret { i64, i1 } %result
}
define { i64, i1 } @errorConstructorEvalError(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %result = call { i64, i1 } @errorConstructorCall(i64 4, i64 %argc, ptr %argv)
  ret { i64, i1 } %result
}
define { i64, i1 } @errorConstructorURIError(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %result = call { i64, i1 } @errorConstructorCall(i64 5, i64 %argc, ptr %argv)
  ret { i64, i1 } %result
}
define { i64, i1 } @errorConstructorSyntaxError(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %result = call { i64, i1 } @errorConstructorCall(i64 6, i64 %argc, ptr %argv)
  ret { i64, i1 } %result
}
define { i64, i1 } @errorConstructorReferenceError(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %result = call { i64, i1 } @errorConstructorCall(i64 7, i64 %argc, ptr %argv)
  ret { i64, i1 } %result
}

@.errorctor.key.constructor = private unnamed_addr constant [12 x i8] c"constructor\00"
@.errorctor.key.tostring = private unnamed_addr constant [9 x i8] c"toString\00"
@.errorctor.not.error = private unnamed_addr constant [48 x i8] c"Error.prototype.toString called on a non-object\00"
; What an error object inherits from its class's prototype that the runtime models: `constructor`,
; the builtin constructor value, and `toString`. Undefined for any other key, and for an object of
; no error class.
define i64 @errorInheritedProperty(ptr %object, i64 %key.len, ptr %key.ptr) {
entry:
  %class.slot = getelementptr i8, ptr %object, i64 48
  %class.id = load i64, ptr %class.slot
  %is.error = icmp ne i64 %class.id, 0
  %in.table = icmp ult i64 %class.id, 8
  %known = and i1 %is.error, %in.table
  br i1 %known, label %check.constructor, label %absent
check.constructor:
  %is.constructor.length = icmp eq i64 %key.len, 11
  br i1 %is.constructor.length, label %compare.constructor, label %check.tostring
compare.constructor:
  %constructor.comparison = call i32 @memcmp(ptr %key.ptr, ptr @.errorctor.key.constructor, i64 11)
  %is.constructor = icmp eq i32 %constructor.comparison, 0
  br i1 %is.constructor, label %constructor, label %absent
constructor:
  %value = call i64 @errorConstructorValue(i64 %class.id)
  ret i64 %value
check.tostring:
  %is.tostring.length = icmp eq i64 %key.len, 8
  br i1 %is.tostring.length, label %compare.tostring, label %absent
compare.tostring:
  %tostring.comparison = call i32 @memcmp(ptr %key.ptr, ptr @.errorctor.key.tostring, i64 8)
  %is.tostring = icmp eq i32 %tostring.comparison, 0
  br i1 %is.tostring, label %tostring, label %absent
tostring:
  %method = call i64 @functionObjectNew(ptr @errorToStringMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  ret i64 %method
absent:
  ret i64 9222246136947933184
}

; Error.prototype.toString: "name: message", or the name alone for an empty message.
define { i64, i1 } @errorToStringMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.object = call i1 @valueIsObject(i64 %this.value)
  br i1 %is.object, label %convert, label %not.object
convert:
  %object = call ptr @valueObjectPtr(i64 %this.value)
  %string = call { ptr, i64 } @errorToString(ptr %object)
  %string.ptr = extractvalue { ptr, i64 } %string, 0
  %string.len = extractvalue { ptr, i64 } %string, 1
  %boxed = call i64 @valueCopyString(ptr %string.ptr, i64 %string.len)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %ok = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok
not.object:
  %message = call i64 @valueBoxString(ptr @.errorctor.not.error, i64 47)
  %error = call { i64, i1 } @iteratorTypeError(i64 %message)
  ret { i64, i1 } %error
}

@.errorctor.key.cause = private unnamed_addr constant [6 x i8] c"cause\00"
; InstallErrorCause: an options object that has a `cause`, own or inherited, gives the error an own,
; non-enumerable `cause` holding it.
define void @errorInstallCause(ptr %error, i64 %options) {
entry:
  %is.object = call i1 @valueIsObject(i64 %options)
  br i1 %is.object, label %check, label %done
check:
  %options.ptr = call ptr @valueObjectPtr(i64 %options)
  %has.cause = call i1 @objectHas(ptr %options.ptr, i64 5, ptr @.errorctor.key.cause)
  br i1 %has.cause, label %install, label %done
install:
  %cause = call i64 @objectGet(ptr %options.ptr, i64 5, ptr @.errorctor.key.cause)
  call void @objectDefineDataProperty(ptr %error, i64 5, ptr @.errorctor.key.cause, i64 %cause, i64 5)
  br label %done
done:
  ret void
}

@.uncaught.empty.message = private unnamed_addr constant [5 x i8] c"%s:\0A\00"
; The report of an uncaught exception. An error always prints as `Name: message`, keeping the colon
; when the message is empty, so the report tells an error apart from a thrown string; any other value
; prints as `print` does.
define void @valuePrintUncaught(i64 %value) {
entry:
  %is.object = call i1 @valueIsObject(i64 %value)
  br i1 %is.object, label %check.error, label %plain
check.error:
  %object = call ptr @valueObjectPtr(i64 %value)
  %class.slot = getelementptr i8, ptr %object, i64 48
  %class.id = load i64, ptr %class.slot
  %is.error = icmp ne i64 %class.id, 0
  br i1 %is.error, label %error, label %plain
error:
  %message = call i64 @objectGet(ptr %object, i64 7, ptr @.error.key.message)
  %message.string = call { ptr, i64 } @valueToString(i64 %message)
  %message.len = extractvalue { ptr, i64 } %message.string, 1
  %message.empty = icmp eq i64 %message.len, 0
  br i1 %message.empty, label %empty.message, label %plain
empty.message:
  %name.string = call { ptr, i64 } @errorToString(ptr %object)
  %name.ptr = extractvalue { ptr, i64 } %name.string, 0
  call i32 (ptr, ...) @printf(ptr @.uncaught.empty.message, ptr %name.ptr)
  ret void
plain:
  call void @valuePrint(i64 %value)
  ret void
}

; The completion of reading a name nothing declares: a thrown ReferenceError with `message`.
define { i64, i1 } @errorThrowReference(i64 %message) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %message)
  %error = call ptr @errorNew(i64 7, i64 14, ptr @.errorctor.name.ReferenceError, i64 %message)
  %error.value = call i64 @valueBoxObject(ptr %error)
  call void @gcRootRestore(i64 %frame)
  %thrown.0 = insertvalue { i64, i1 } undef, i64 %error.value, 0
  %thrown = insertvalue { i64, i1 } %thrown.0, i1 true, 1
  ret { i64, i1 } %thrown
}
