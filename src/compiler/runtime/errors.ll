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
