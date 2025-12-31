import * as vscode from "vscode";
import * as path from "path";
import { getWorkspacePassages, Passage } from "./passage";
import { moveToFile, MoveData } from "./file-ops";

export class ExtractPassage implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.RefactorExtract,
  ];

  constructor(private context: vscode.ExtensionContext) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] | undefined {
    const passages = getWorkspacePassages(this.context);

    // Use fsPath for comparison if available, or normalize
    const docPath = document.uri.fsPath;

    const passage = passages.find((p) => {
      // p.origin.full might be path or fsPath depending on how it was created
      // Try to match both or normalize
      return (
        (p.origin.full === docPath ||
          vscode.Uri.file(p.origin.full).fsPath === docPath) &&
        p.range.start.line === range.start.line
      );
    });

    if (!passage) return;

    const action = new vscode.CodeAction(
      `Extract passage to file`,
      vscode.CodeActionKind.RefactorExtract
    );
    action.command = {
      command: "twee3LanguageTools.extractPassage",
      title: "Extract passage to file",
      arguments: [passage],
    };
    return [action];
  }
}

export const extractPassageCommand = async (
  context: vscode.ExtensionContext,
  passage: Passage
) => {
  if (!passage) return;

  // Sanitize filename
  const safeName = passage.name.replace(/[\/\\:*?"<>|]/g, "_");

  const dir = path.dirname(passage.origin.full);
  const fileType = passage.origin.full.split(".").pop() ?? ".twee";
  const newPath = path.join(dir, safeName + "." + fileType);

  const moveData: MoveData = {
    toFile: newPath,
    passages: [
      {
        name: passage.name,
        range: {
          startLine: passage.range.start.line,
          startCharacter: passage.range.start.character,
          endLine: passage.range.end.line,
          endCharacter: passage.range.end.character,
        },
        stringRange: passage.stringRange,
        origin: passage.origin,
      },
    ],
  };

  await moveToFile(context, moveData);
};
