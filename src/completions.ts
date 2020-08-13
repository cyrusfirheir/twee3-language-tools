import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';

export const completion = function () {
    let r: vscode.CompletionItem[] = [];
    
    let storydataSnippet = new vscode.CompletionItem("StoryData", vscode.CompletionItemKind.Snippet);
    storydataSnippet.insertText = new vscode.SnippetString([
        `:: StoryData`,
        `{`,
            `\t"ifid": "${uuidv4().toUpperCase()}",`,
            `\t"format": "$1",`,
            `\t"format-version": "$2",`,
            `\t"start": "$3"`,
        `}`
    ].join("\n"));
    storydataSnippet.documentation = new vscode.MarkdownString("Inserts JSON chunk for `StoryData` special passage along with a generated IFID.\n\n");
    storydataSnippet.detail = "StoryData JSON chunk";

    r.push(storydataSnippet);

    return r;
};