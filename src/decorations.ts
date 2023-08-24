import * as vscode from 'vscode';

import * as sc2 from './sugarcube-2/macros';
import { LanguageID } from './sugarcube-2/configuration';

export const updateDecorations = async function(ctx: vscode.ExtensionContext, editor: vscode.TextEditor) {
	if (editor.document.languageId === LanguageID) {
		await sc2.updateDecorations(ctx, editor);
	}
}

export const clearDecorations = async function(ctx: vscode.ExtensionContext, editor: vscode.TextEditor) {
    if (editor.document.languageId === LanguageID) {
        await sc2.clearDecorations(ctx, editor);
    }
}

/// This function is used when we do not know which specific editor changed.
export const updateTextEditorDecorations = function(ctx: vscode.ExtensionContext) {
	return Promise.all(vscode.window.visibleTextEditors.map(editor => updateDecorations(ctx, editor)));
}