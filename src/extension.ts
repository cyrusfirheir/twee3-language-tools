import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import * as glob from 'glob';

import headsplit from './headsplit';

import { parseText } from './parse-text';
import { updateDiagnostics } from './diagnostics';

import { PassageListProvider, Passage } from './tree-view';

import * as sc2m from './sugarcube-2/macros';
import * as sc2ca from './sugarcube-2/code-actions';

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
		/^twee3.*/.test(document.languageId) &&
		document.languageId !== format
	) return vscode.languages.setTextDocumentLanguage(document, format);
	else return new Promise(res => res(document));
};

const documentSelector: vscode.DocumentSelector = {
	pattern: "**/*.tw*",
};

export async function activate(context: vscode.ExtensionContext) {
	ctx = context;

	const passageListProvider = new PassageListProvider(ctx);
	const collection = vscode.languages.createDiagnosticCollection();

	function start() {
		collection.clear();
		return Promise.all([
			ctx.workspaceState.update("passages", undefined),
			vscode.workspace.getConfiguration("twee3LanguageTools.storyformat").update("current", "")
		]);
	}
	
	await start();

	function fileGlob() {
		let include: string[] = vscode.workspace.getConfiguration("twee3LanguageTools.directories").get("include", []);
		if (!include.length) include.push("**");
		let exclude: string[] = vscode.workspace.getConfiguration("twee3LanguageTools.directories").get("exclude", []);
		let files: string[] = [];
		vscode.workspace.workspaceFolders?.forEach(el => {
			include.forEach(elem => {
				files = [ ...files, ...glob.sync(el.uri.fsPath + "/" + elem + "/**/*.tw*", { ignore: exclude }) ];
			})
		});
		return files;
	}

	function prepare(file: string) {
		vscode.workspace.openTextDocument(file).then(async doc => {
			tweeProjectConfig(doc);
			updateDiagnostics(doc, collection);
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) await parseText(ctx, doc, passageListProvider);
		})
	}

	fileGlob().forEach(file => prepare(file));

	if (!vscode.workspace.getConfiguration("editor").get("semanticTokenColorCustomizations.enabled")) {
		vscode.workspace.getConfiguration("editor").update("semanticTokenColorCustomizations", {
			"enabled": true
		}, true);
	}

	ctx.subscriptions.push(
		vscode.languages.registerDocumentSemanticTokensProvider(documentSelector, new DocumentSemanticTokensProvider(), legend)
		,
		vscode.languages.registerHoverProvider(documentSelector, {
			provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
				if (document.languageId == "twee3-sugarcube-2") {
					return sc2m.hover(document, position);
				} else {
					return null;
				}
			}
		})
		,
		vscode.window.onDidChangeTextEditorSelection(async e => {
			if (e.textEditor.document.languageId === "twee3-sugarcube-2" && vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.features").get("macroTagMatching")) {
				let collected = await sc2m.collect(e.textEditor.document.getText());
				let r: vscode.Range[] = [];
				e.selections.forEach(sel => {
					let pos = sel.active;
					let target = collected.macros
						.filter(el => el.open && el.id !== el.pair).reverse()
						.find(el => (new vscode.Range(el.range.start, collected.macros[el.pair].range.end)).contains(pos));
					if (target) {
						r.push(target.range, collected.macros[target.pair].range);
					}
				});
				e.textEditor.setDecorations(sc2m.decor, r);
			}
		})
		,
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				updateDiagnostics(editor.document, collection);
			}
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
				fileGlob().forEach(file => {
					vscode.workspace.openTextDocument(file).then(doc => {
						changeStoryFormat(doc);
						updateDiagnostics(doc, collection);
					})
				});
			}
			if (e.affectsConfiguration("twee3LanguageTools.passage")) {
				if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list"))  {
					fileGlob().forEach(file => {
						vscode.workspace.openTextDocument(file).then(doc => parseText(ctx, doc, passageListProvider));
					});
				}
				else ctx.workspaceState.update("passages", undefined).then(() => passageListProvider.refresh());
			}
			if (e.affectsConfiguration("twee3LanguageTools.directories")) {
				start().then(() => {
					fileGlob().forEach(file => prepare(file));
				});
			}
		})
		,
		vscode.workspace.onDidCreateFiles(e => {
			e.files.forEach(file => vscode.workspace.openTextDocument(file).then((doc) => changeStoryFormat(doc)));
		})
		,
		vscode.workspace.onDidDeleteFiles(e => {
			for (let file of e.files) {
				const oldPassages: Passage[] = ctx.workspaceState.get("passages", []);
				const passages = oldPassages.filter(el => el.origin !== file.path);
				ctx.workspaceState.update("passages", passages).then(() => passageListProvider.refresh());
			}
		})
		,
		vscode.workspace.onDidRenameFiles(async e => {
			for (let file of e.files) {
				let doc = await vscode.workspace.openTextDocument(file.newUri);
				changeStoryFormat(doc);
				let passages: Passage[] = ctx.workspaceState.get("passages", []);
				passages.forEach(el => {
					if (el.origin === file.oldUri.path) el.origin = file.newUri.path;
				});
				await ctx.workspaceState.update("passages", passages);
				passageListProvider.refresh();
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
		vscode.commands.registerCommand("twee3LanguageTools.refreshDiagnostics", () => {
			let doc = vscode.window.activeTextEditor?.document;
			if (doc) updateDiagnostics(doc, collection);
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.passage.jump", (item: Passage) => {
			vscode.window.showTextDocument(vscode.Uri.file(item.origin)).then(editor => {
				const regexp = new RegExp(
					"^::\\s*" +
					item.name.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&") +
					"\\s*(\\[|\\{|$)"
				);
				const lines = editor.document.getText().split(/\r?\n/);
				const start = Math.max(0, lines.findIndex(el => regexp.test(el)));
				editor.revealRange(new vscode.Range(start, 0, start, 0), vscode.TextEditorRevealType.AtTop);
			});
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.passage.list", () => {
			const config = vscode.workspace.getConfiguration("twee3LanguageTools.passage");
			config.update("list", !config.get("list"));
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.passage.group.none", () => {
			vscode.workspace.getConfiguration("twee3LanguageTools.passage").update("group", "None");
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.passage.group.file", () => {
			vscode.workspace.getConfiguration("twee3LanguageTools.passage").update("group", "File");
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.passage.group.folder", () => {
			vscode.workspace.getConfiguration("twee3LanguageTools.passage").update("group", "Folder");
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.passage.group.tag", () => {
			vscode.workspace.getConfiguration("twee3LanguageTools.passage").update("group", "Tag");
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.ifid.generate", () => {
			vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(uuidv4().toUpperCase()));
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.sc2.defineMacro", sc2ca.unrecognizedMacroFixCommand)
		,
		vscode.languages.registerCodeActionsProvider("twee3-sugarcube-2", new sc2ca.EndMacro(), {
			providedCodeActionKinds: sc2ca.EndMacro.providedCodeActionKinds
		})
		,
		vscode.languages.registerCodeActionsProvider("twee3-sugarcube-2", new sc2ca.Unrecognized(), {
			providedCodeActionKinds: sc2ca.Unrecognized.providedCodeActionKinds
		})
	);
};