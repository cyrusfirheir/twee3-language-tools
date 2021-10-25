//#region Imports
import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';

import { parseText, DocumentSemanticTokensProvider, legend } from './parse-text';
import { updateDiagnostics } from './diagnostics';
import { tweeProjectConfig, changeStoryFormat } from './twee-project';

import { sendPassageDataToClient, toUpdatePassage, updatePassages } from "./story-map/socket";
import { startUI, stopUI, storyMapIO } from "./story-map/index";

import { fileGlob } from './file-ops';

import { PassageListProvider, Passage, jumpToPassage } from './passage';

import * as sc2m from './sugarcube-2/macros';
import * as sc2ca from './sugarcube-2/code-actions';
import { packer } from './story-map/packer';

import { passageCounter } from './status-bar'
import { sbStoryMapConfirmationDialog } from './status-bar';
//#endregion

const documentSelector: vscode.DocumentSelector = {
	pattern: "**/*.{tw,twee}",
};

export async function activate(ctx: vscode.ExtensionContext) {
	vscode.commands.executeCommand('setContext', 't3lt.extensionActive', true);

	const sbPassageCounter = passageCounter(ctx);


	const passageListProvider = new PassageListProvider(ctx);
	const collection = vscode.languages.createDiagnosticCollection();

	if (!ctx.workspaceState.get("StoryData")) {
		await ctx.workspaceState.update("StoryData", {});
	}

	function start() {
		collection.clear();
		return ctx.workspaceState.update("passages", undefined);
	}

	await start();
	
	function prepare(file: string) {
		vscode.workspace.openTextDocument(file).then(async doc => {
			await changeStoryFormat(doc);
			tweeProjectConfig(ctx, doc);
			updateDiagnostics(ctx, doc, collection);
			await parseText(ctx, doc);
			passageCounter(ctx, sbPassageCounter);
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
		})
	}

	fileGlob().forEach(file => prepare(file));

	if (!vscode.workspace.getConfiguration("editor").get("semanticTokenColorCustomizations.enabled")) {
		vscode.workspace.getConfiguration("editor").update("semanticTokenColorCustomizations", {
			"enabled": true
		}, true);
	}

	const storyMap: storyMapIO = { client: undefined, server: undefined, disconnectTimeout: undefined };

	const startUIWrapper = () => startUI(ctx, storyMap);
	const stopUIWrapper = () => stopUI(storyMap);

	const mapShowCommand = vscode.commands.registerCommand("twee3LanguageTools.storyMap.show", startUIWrapper);
	const mapStopCommand = vscode.commands.registerCommand("twee3LanguageTools.storyMap.stop", stopUIWrapper);

	ctx.subscriptions.push(
		mapShowCommand, mapStopCommand, sbPassageCounter,
		vscode.languages.registerDocumentSemanticTokensProvider(documentSelector, new DocumentSemanticTokensProvider(ctx), legend)
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
				let collected = await sc2m.collectCache.get(e.textEditor.document);
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
				e.textEditor.setDecorations(sc2m.macroTagMatchingDecor, r);
			}
		})
		,
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor && /^twee3.*/.test(editor.document.languageId)) {
				updateDiagnostics(ctx, editor.document, collection);
			}
		})
		,
		vscode.workspace.onDidOpenTextDocument(document => {
			if (!/^twee3.*/.test(document.languageId)) return;
			changeStoryFormat(document);
			updateDiagnostics(ctx, document, collection);
		})
		,
		vscode.workspace.onDidChangeTextDocument(e => {
			if (!/^twee3.*/.test(e.document.languageId)) return;
			updateDiagnostics(ctx, e.document, collection);
		})
		,
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration("twee3LanguageTools.storyformat")) {
				fileGlob().forEach(file => {
					vscode.workspace.openTextDocument(file).then(doc => {
						changeStoryFormat(doc);
						updateDiagnostics(ctx, doc, collection);
					});
				});
			}
			if (e.affectsConfiguration("twee3LanguageTools.passage")) {
				passageListProvider.refresh();
			}
			if (e.affectsConfiguration("twee3LanguageTools.directories")) {
				start().then(() => {
					fileGlob().forEach(file => prepare(file));
				});
			}
			if (e.affectsConfiguration("twee3LanguageTools.sugarcube-2.cache.argumentInformation") && !vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.cache").get(".argumentInformation")) {
				// The configuration for this setting has been changed and it is now false, so we
				// clear the cache.
				sc2m.argumentCache.clear();
			}
			if (e.affectsConfiguration("twee3LanguageTools.sugarcube-2.error.parameterValidation")) {
				// Note: We simply clear the arguments cache to force it to revalidate.
				// This could be done in a more efficient manner, but this is good enough.
				sc2m.argumentCache.clear();
			}
			if (e.affectsConfiguration("twee3LanguageTools.sugarcube-2.warning.barewordLinkPassageChecking")) {
				sc2m.argumentCache.clearMacrosUsingPassage();
			}
		})
		,
		vscode.workspace.onDidCreateFiles(e => {
			e.files.forEach(file => vscode.workspace.openTextDocument(file).then((doc) => changeStoryFormat(doc)));
		})
		,
		vscode.workspace.onDidDeleteFiles(e => {
			e.files.forEach(file => sc2m.collectCache.clearFilename(file.fsPath));

			const removedFilePaths = e.files.map((file) => file.path);
			const oldPassages: Passage[] = ctx.workspaceState.get("passages", []);
			const newPassages: Passage[] = oldPassages.filter((passage) => !removedFilePaths.includes(passage.origin.full));
			ctx.workspaceState.update("passages", newPassages).then(() => {
				if (storyMap.client) sendPassageDataToClient(ctx, storyMap.client);
				passageListProvider.refresh();
			});
		})
		,
		vscode.workspace.onDidRenameFiles(async e => {
			for (let file of e.files) {
				let doc = await vscode.workspace.openTextDocument(file.newUri);
				changeStoryFormat(doc);

				sc2m.collectCache.clearFilename(file.oldUri.fsPath);

				let passages: Passage[] = ctx.workspaceState.get("passages", []);
				passages.forEach(el => {
					if (el.origin.full === file.oldUri.path) {
						el.origin.root = vscode.workspace.getWorkspaceFolder(file.newUri)?.uri.path || "";
						el.origin.path = file.newUri.path.replace(el.origin.root, "");
						el.origin.full = file.newUri.path;
					}
				});
				await ctx.workspaceState.update("passages", passages);
				if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
				if (storyMap.client) sendPassageDataToClient(ctx, storyMap.client);
			}
		})
		,
		vscode.workspace.onDidSaveTextDocument(async document => {
			if (!/^twee3.*/.test(document.languageId)) return;
			tweeProjectConfig(ctx, document);
			await parseText(ctx, document);
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
			if (storyMap.client) sendPassageDataToClient(ctx, storyMap.client);
			passageCounter(ctx, sbPassageCounter);
		})
		,
		vscode.window.registerTreeDataProvider(
			't3lt-passages-list',
			passageListProvider
		)
		,
		vscode.commands.registerCommand("twee3LanguageTools.refreshDiagnostics", () => {
			const doc = vscode.window.activeTextEditor?.document;
			if (doc) updateDiagnostics(ctx, doc, collection);
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.passage.pack", async () => {
			const proceed = await vscode.window.showWarningMessage(
				`This action replaces position data for all passages in workspace. It will also overwrite any unsaved changes.`,
				"Proceed"
			);
			if (proceed === "Proceed") {
				const passages = ctx.workspaceState.get("passages") as Passage[];
				updatePassages(ctx, packer(passages).map((p: Passage) => toUpdatePassage(p)));
			}
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.passage.jump", (item: Passage) => {
			jumpToPassage(item);
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
		vscode.commands.registerCommand("twee3LanguageTools.sc2.clearArgumentCache", () => {
			// Provide a command to clear the argument cache for if there is ever any bugs with the
			// implementation, it can tide users over until a fix.
			sc2m.argumentCache.clear();
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.sc2.addAllUnrecognizedMacros", async () => {
			await sc2ca.addAllUnrecognizedMacros();
		})
		,
		vscode.languages.registerCodeActionsProvider("twee3-sugarcube-2", new sc2ca.EndMacro(), {
			providedCodeActionKinds: sc2ca.EndMacro.providedCodeActionKinds
		})
		,
		vscode.languages.registerCodeActionsProvider("twee3-sugarcube-2", new sc2ca.Unrecognized(), {
			providedCodeActionKinds: sc2ca.Unrecognized.providedCodeActionKinds
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.passageCounter.clickCheck", sbStoryMapConfirmationDialog)
	);
};