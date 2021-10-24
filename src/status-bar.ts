import * as vscode from "vscode";

export function passageCounter(ctx: vscode.ExtensionContext, StatusBarItem?: vscode.StatusBarItem) {
  const passages = ctx.workspaceState.get("passages", []);
  if (!StatusBarItem) {
    StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  };
  StatusBarItem.text = `Passage Count: ${passages.length}`;
  StatusBarItem.tooltip = `Total Number of Passages in Twee files: ${passages.length}\nNumber of Story Passages: (WIP)\nClick to open Story Map`;
  StatusBarItem.command = "twee3LanguageTools.passageCounter.clickCheck"
  if (passages.length != 0) {
    StatusBarItem.show();
  } else {
    StatusBarItem.hide();
  }
  return StatusBarItem;
  
};

export async function sbStoryMapConfirmationDialog() {
    const settings = vscode.workspace.getConfiguration("twee3LanguageTools.passageCounter");
    const confirmation = settings.get("openStoryMapWithoutConfirmation");
    if (confirmation) {
        vscode.commands.executeCommand("twee3LanguageTools.storyMap.show");
    } else {
      const answer = await vscode.window.showInformationMessage(
        "Would you like to open the Story Map?\n(Opens in default external browser)",
        { modal: true },
        "Open This Time", "Always Open"
      );
        switch (answer) {
            case "Always Open": settings.update("openStoryMapWithoutConfirmation", true);
            case "Open This Time": vscode.commands.executeCommand("twee3LanguageTools.storyMap.show");
        }
    }
}