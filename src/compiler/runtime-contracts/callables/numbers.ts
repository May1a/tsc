// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { numbersContracts } from "../numbers.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createNumbersCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof numbersContracts> {
  return {
    "globalIsNaN": registerRuntimeContract(module, numbersContracts.globalIsNaN),
    "numberIsNaN": registerRuntimeContract(module, numbersContracts.numberIsNaN),
    "numberIsFinite": registerRuntimeContract(module, numbersContracts.numberIsFinite),
    "numberIsInteger": registerRuntimeContract(module, numbersContracts.numberIsInteger),
    "numberIsSafeInteger": registerRuntimeContract(module, numbersContracts.numberIsSafeInteger),
    "numberToFixed": registerRuntimeContract(module, numbersContracts.numberToFixed),
    "numberToPrecision": registerRuntimeContract(module, numbersContracts.numberToPrecision),
    "numberToExponential": registerRuntimeContract(module, numbersContracts.numberToExponential),
    "numberToStringRadix": registerRuntimeContract(module, numbersContracts.numberToStringRadix),
    "parseInt": registerRuntimeContract(module, numbersContracts.parseInt),
    "parseFloat": registerRuntimeContract(module, numbersContracts.parseFloat),
    "mathAbs": registerRuntimeContract(module, numbersContracts.mathAbs),
    "mathFloor": registerRuntimeContract(module, numbersContracts.mathFloor),
    "mathCeil": registerRuntimeContract(module, numbersContracts.mathCeil),
    "mathTrunc": registerRuntimeContract(module, numbersContracts.mathTrunc),
    "mathRound": registerRuntimeContract(module, numbersContracts.mathRound),
    "mathSqrt": registerRuntimeContract(module, numbersContracts.mathSqrt),
    "mathPow": registerRuntimeContract(module, numbersContracts.mathPow),
    "mathCbrt": registerRuntimeContract(module, numbersContracts.mathCbrt),
    "mathExp": registerRuntimeContract(module, numbersContracts.mathExp),
    "mathLog": registerRuntimeContract(module, numbersContracts.mathLog),
    "mathLog2": registerRuntimeContract(module, numbersContracts.mathLog2),
    "mathLog10": registerRuntimeContract(module, numbersContracts.mathLog10),
    "mathHypot2": registerRuntimeContract(module, numbersContracts.mathHypot2),
    "mathMin2": registerRuntimeContract(module, numbersContracts.mathMin2),
    "mathMax2": registerRuntimeContract(module, numbersContracts.mathMax2),
    "mathSign": registerRuntimeContract(module, numbersContracts.mathSign),
    "mathRandom": registerRuntimeContract(module, numbersContracts.mathRandom),
    "mathFround": registerRuntimeContract(module, numbersContracts.mathFround),
    "mathClz32": registerRuntimeContract(module, numbersContracts.mathClz32),
    "mathImul": registerRuntimeContract(module, numbersContracts.mathImul),
    "mathSin": registerRuntimeContract(module, numbersContracts.mathSin),
    "mathCos": registerRuntimeContract(module, numbersContracts.mathCos),
    "mathTan": registerRuntimeContract(module, numbersContracts.mathTan),
    "numberToInt32": registerRuntimeContract(module, numbersContracts.numberToInt32),
    "numberToIndex": registerRuntimeContract(module, numbersContracts.numberToIndex),
  };
}
