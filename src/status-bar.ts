import * as vscode from "vscode";

export function passageCounter(ctx: vscode.ExtensionContext, StatusBarItem?: vscode.StatusBarItem) {
  const passages = ctx.workspaceState.get("passages", []);
  if (!StatusBarItem) {
    StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  };
  StatusBarItem.text = `Passages: ${passages.length}`;
  if (passages.length != 0) {
    StatusBarItem.show();
  } else {
    StatusBarItem.hide();
  }
  return StatusBarItem;
  
};

