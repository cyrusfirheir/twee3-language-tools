import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import headsplit from './headsplit';

import * as twee3 from './completions';
import * as sc2 from './sugarcube-2/completions';

import { parseText } from './parseText';
import { updateDiagnostics } from './diagnostics';
import { collectDocumentation } from './collectDocs';

let ctx: vscode.ExtensionContext;

const tokenTypes = new Map<string, number>();
const legend = (function () {
	const tokenTypesLegend: string[] = [
		"startToken", "passageName", "passageTags", "passageMeta", "special", "comment"
	];
	tokenTypesLegend.forEach((tokenType, index) => tokenTypes.set(tokenType, index));
	return new vscode.SemanticTokensLegend(tokenTypesLegend);
})();

class DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
	async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
		const allTokens = parseText(document.getText());
		const builder = new vscode.SemanticTokensBuilder();
		allTokens.forEach((_token) => {
			builder.push(_token.line, _token.startCharacter, _token.length, this._encodeTokenType(_token.tokenType));
		});
		return builder.build();
	}

	private _encodeTokenType(tokenType: string): number {
		if (tokenTypes.has(tokenType)) {
			return tokenTypes.get(tokenType)!;
		} else if (tokenType === 'notInLegend') {
			return tokenTypes.size + 2;
		}
		return 0;
	}
}

const tweeProjectConfig = function (document: vscode.TextDocument) {
	const raw = document.getText();
	if (!raw.match(/^::\s*StoryData\b/gm)) return;
	const storydata = headsplit(raw, /^::(.*)/).find(el => el.header === "StoryData");
	if (!storydata?.content) return;
	let formatInfo: any = undefined;
	try {
		formatInfo = JSON.parse(storydata.content);
	} catch {
		vscode.window.showErrorMessage("Malformed StoryData JSON!");
		return;
	}
	const format = formatInfo.format.toLowerCase() + "-" + formatInfo["format-version"].split(".")[0];
	const config = vscode.workspace.getConfiguration("twee3LanguageTools.storyformat");
	if (config.get("current") !== format) {
		config.update("current", format)
			.then(() => vscode.window.showInformationMessage("Storyformat set to " + format));
	}
};

const changeStoryFormat = async function (document: vscode.TextDocument) {
	let format: string = "";
	const config = vscode.workspace.getConfiguration("twee3LanguageTools.storyformat");
	const override = config.get("override") || "";
	if (!override) format = "twee3-" + config.get("current");
	else format = "twee3-" + override;
	const langs = await vscode.languages.getLanguages();
	if (!langs.includes(format)) format = "twee3";
	if (
		document.fileName.match(/\.tw(?:ee)?$/) &&
		document.languageId !== format
	) return vscode.languages.setTextDocumentLanguage(document, format);
	else return new Promise(res => res(document));
};

export async function activate(context: vscode.ExtensionContext) {
	ctx = context;

	await vscode.workspace.getConfiguration("twee3LanguageTools.storyformat").update("current", "");

	const pkg = JSON.parse(fs.readFileSync(path.join(ctx.extensionPath, "package.json"), "utf8"));
	const formats = pkg.contributes.languages.map((el: { id: any }) => el.id);

	vscode.workspace.findFiles("**/*.tw*").then(async (v) => {
		for (let file of v) {
			const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file.path));
			tweeProjectConfig(doc);
			collectDocumentation(ctx, doc);
		}
	});
	
	vscode.workspace.findFiles("**/*.d.{js,ts}", "**/node_modules/**").then(async (v) => {
		for (let file of v) {
			const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file.path));
			collectDocumentation(ctx, doc);
		}
	});

	if (!vscode.workspace.getConfiguration("editor").get("semanticTokenColorCustomizations.enabled")) {
		vscode.workspace.getConfiguration("editor").update("semanticTokenColorCustomizations", {
			"enabled": true
		}, true);
	}

	const collection = vscode.languages.createDiagnosticCollection('test');
	if (vscode.window.activeTextEditor) {
		updateDiagnostics(vscode.window.activeTextEditor.document, collection);
	}

	ctx.subscriptions.push(
		vscode.languages.registerDocumentSemanticTokensProvider(formats.map((el: string) => {
			return { language: el };
		}), new DocumentSemanticTokensProvider(), legend)
		,
		vscode.languages.registerCompletionItemProvider(formats.map((el: string) => {
			return { language: el };
		}), {
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
				return twee3.completion();
			}
		})
		,
		vscode.languages.registerCompletionItemProvider({
			language: 'twee3-sugarcube-2'
		}, {
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
				return sc2.completion(ctx);
			}
		})
		,
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) updateDiagnostics(editor.document, collection);
		})
		,
		vscode.workspace.onDidOpenTextDocument(document => {
			updateDiagnostics(document, collection);
		})
		,
		vscode.workspace.onDidChangeTextDocument(e => {
			updateDiagnostics(e.document, collection);
		})
		,
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration("twee3LanguageTools.storyformat")) {
				vscode.workspace.findFiles("**/*.tw*").then(async v => {
					for (let file of v) {
						const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file.path));
						changeStoryFormat(doc);
					}
				});
			}
		})
		,
		vscode.workspace.onDidSaveTextDocument(document => {
			collectDocumentation(ctx, document);
			tweeProjectConfig(document);
		})
	);
}

export async function deactivate(): Promise<void> {
	ctx.workspaceState.update("jsdocs", {});
}