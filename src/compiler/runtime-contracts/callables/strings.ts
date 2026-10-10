// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { stringsContracts } from "../strings.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createStringsCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof stringsContracts> {
  return {
    "strConcat": registerRuntimeContract(module, stringsContracts.strConcat),
    "strEquals": registerRuntimeContract(module, stringsContracts.strEquals),
    "stringIncludes": registerRuntimeContract(module, stringsContracts.stringIncludes),
    "stringStartsWith": registerRuntimeContract(module, stringsContracts.stringStartsWith),
    "stringStartsWithAt": registerRuntimeContract(module, stringsContracts.stringStartsWithAt),
    "stringEndsWith": registerRuntimeContract(module, stringsContracts.stringEndsWith),
    "stringAt": registerRuntimeContract(module, stringsContracts.stringAt),
    "stringNormalize": registerRuntimeContract(module, stringsContracts.stringNormalize),
    "stringCharCodeAt": registerRuntimeContract(module, stringsContracts.stringCharCodeAt),
    "stringCharAt": registerRuntimeContract(module, stringsContracts.stringCharAt),
    "stringSlice": registerRuntimeContract(module, stringsContracts.stringSlice),
    "stringSubstring": registerRuntimeContract(module, stringsContracts.stringSubstring),
    "stringSubstr": registerRuntimeContract(module, stringsContracts.stringSubstr),
    "stringFromCharCode": registerRuntimeContract(module, stringsContracts.stringFromCharCode),
    "stringIndexOf": registerRuntimeContract(module, stringsContracts.stringIndexOf),
    "stringLastIndexOf": registerRuntimeContract(module, stringsContracts.stringLastIndexOf),
    "stringIsAsciiWhitespace": registerRuntimeContract(module, stringsContracts.stringIsAsciiWhitespace),
    "stringSliceCopy": registerRuntimeContract(module, stringsContracts.stringSliceCopy),
    "stringTrimStartIndex": registerRuntimeContract(module, stringsContracts.stringTrimStartIndex),
    "stringTrimEndIndex": registerRuntimeContract(module, stringsContracts.stringTrimEndIndex),
    "stringTrim": registerRuntimeContract(module, stringsContracts.stringTrim),
    "stringTrimStart": registerRuntimeContract(module, stringsContracts.stringTrimStart),
    "stringTrimEnd": registerRuntimeContract(module, stringsContracts.stringTrimEnd),
    "stringToUpperCase": registerRuntimeContract(module, stringsContracts.stringToUpperCase),
    "stringToLowerCase": registerRuntimeContract(module, stringsContracts.stringToLowerCase),
    "stringRepeat": registerRuntimeContract(module, stringsContracts.stringRepeat),
    "stringReplace": registerRuntimeContract(module, stringsContracts.stringReplace),
    "stringReplaceAll": registerRuntimeContract(module, stringsContracts.stringReplaceAll),
    "stringPad": registerRuntimeContract(module, stringsContracts.stringPad),
    "stringPadStart": registerRuntimeContract(module, stringsContracts.stringPadStart),
    "stringPadEnd": registerRuntimeContract(module, stringsContracts.stringPadEnd),
    "stringSplit": registerRuntimeContract(module, stringsContracts.stringSplit),
    "stringUtf16Length": registerRuntimeContract(module, stringsContracts.stringUtf16Length),
    "stringPropertyGet": registerRuntimeContract(module, stringsContracts.stringPropertyGet),
  };
}
