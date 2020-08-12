import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';

export const completion = function () {
    let r: vscode.CompletionItem[] = [];
    
    let storydataSnippet = new vscode.CompletionItem("StoryData", vscode.CompletionItemKind.Snippet);
    storydataSnippet.insertText = new vscode.SnippetString(
        `:: StoryData\n` +
        `{\n\t` +
            `"ifid": "${uuidv4().toUpperCase()}",\n\t` +
            `"format": "$1",\n\t` +
            `"format-version": "$2",\n\t` +
            `"start": "$3"\n` +
        `}`
    );
    storydataSnippet.documentation = new vscode.MarkdownString("Inserts JSON chunk for `StoryData` special passage along with a generated IFID.\n\n");
    storydataSnippet.detail = "StoryData JSON chunk";

    r.push(storydataSnippet);

    return r;
};