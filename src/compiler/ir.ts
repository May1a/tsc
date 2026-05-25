import ts from "typescript";

export type JsIrModule = {
  readonly entry: string;
  readonly modules: ReadonlyArray<JsIrSourceModule>;
};

export type JsIrSourceModule = {
  readonly fileName: string;
  readonly statementCount: number;
};

export const lowerToJsIr = (entry: string, sourceFiles: ReadonlyArray<ts.SourceFile>): JsIrModule => ({
  entry,
  modules: sourceFiles.map((sourceFile) => ({
    fileName: sourceFile.fileName,
    statementCount: sourceFile.statements.length
  }))
});
