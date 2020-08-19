import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';

import headsplit from './headsplit';

import { parseText } from './parseText';
import { updateDiagnostics } from './diagnostics';

import { PassageListProvider, Passage } from './tree-view';

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
		const allTokens = await parseText(ctx, document);
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
		document.languageId.match(/^twee3.*/) &&
		document.languageId !== format
	) return vscode.languages.setTextDocumentLanguage(document, format);
	else return new Promise(res => res(document));
};

export async function activate(context: vscode.ExtensionContext) {
	ctx = context;
	const passageListProvider = new PassageListProvider(ctx);

	await Promise.all([
		ctx.workspaceState.update("passages", undefined),
		vscode.workspace.getConfiguration("twee3LanguageTools.storyformat").update("current", "")
	]);

	vscode.workspace.findFiles("**/*.tw*").then(async (v) => {
		for (let file of v) {
			const doc = await vscode.workspace.openTextDocument(file);
			tweeProjectConfig(doc);
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) await parseText(ctx, doc, passageListProvider);
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
		vscode.languages.registerDocumentSemanticTokensProvider({
			pattern: "**/*.tw*"
		}, new DocumentSemanticTokensProvider(), legend)
		,
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) updateDiagnostics(editor.document, collection);
		})
		,
		vscode.workspace.onDidOpenTextDocument(document => {
			changeStoryFormat(document);
			updateDiagnostics(document, collection);
		})
		,
		vscode.workspace.onDidChangeTextDocument(e => {
			updateDiagnostics(e.document, collection);
		})
		,
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration("twee3LanguageTools.storyformat")) {
				vscode.workspace.findFiles("**/*.tw*")
					.then(v => v.forEach(
						file => vscode.workspace.openTextDocument(file)
							.then(doc => changeStoryFormat(doc))
					));
			}
			if (e.affectsConfiguration("twee3LanguageTools.passage")) {
				if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) vscode.workspace.findFiles("**/*.tw*")
					.then(async v => {
						for (let file of v) {
							const doc = await vscode.workspace.openTextDocument(file);
							parseText(ctx, doc, passageListProvider);
						}
					});
				else ctx.workspaceState.update("passages", undefined).then(() => passageListProvider.refresh());
			}
		})
		,
		vscode.workspace.onDidCreateFiles(e => {
			e.files.forEach(file => vscode.workspace.openTextDocument(file).then((doc) => changeStoryFormat(doc)));
		})
		,
		vscode.workspace.onDidDeleteFiles(async e => {
			for (let file of e.files) {
				const oldPassages: Passage[] = ctx.workspaceState.get("passages", []);
				const passages = Array.from(oldPassages).filter(el => el.__origin__ !== file.path);
				ctx.workspaceState.update("passages", passages);
				passageListProvider.refresh();
			}
		})
		,
		vscode.workspace.onDidRenameFiles(async e => {
			for (let file of e.files) {
				let doc = await vscode.workspace.openTextDocument(file.newUri);
				changeStoryFormat(doc);
				if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) await parseText(ctx, doc, passageListProvider);
			}
		})
		,
		vscode.workspace.onDidSaveTextDocument(document => {
			tweeProjectConfig(document);
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) parseText(ctx, document, passageListProvider);
		})
		,
		vscode.window.registerTreeDataProvider(
			't3lt-passages-list',
			passageListProvider
		)
		,
		vscode.commands.registerCommand("twee3LanguageTools.passage.jump", (item) => {
			vscode.window.showTextDocument(vscode.Uri.file(item.__origin__)).then(editor => {
				const regexp = new RegExp(
					"^::\\s*" +
					item.name.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&") +
					"\\s*(\\[|\\{|$)"
				);
				const lines = editor.document.getText().split(/\r?\n/);
				const start = Math.max(0, lines.findIndex(el => el.match(regexp)));
				editor.revealRange(new vscode.Range(
					new vscode.Position(start, 0),
					new vscode.Position(start, 0)
				), vscode.TextEditorRevealType.AtTop);
			});
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.passage.list", () => {
			const config = vscode.workspace.getConfiguration("twee3LanguageTools.passage");
			config.update("list", !config.get("list"));
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.ifid.generate", () => {
			vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(uuidv4().toUpperCase()));
		})
	);
}