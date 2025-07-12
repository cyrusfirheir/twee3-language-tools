//#region Imports
import { contributes as PackageContributions } from "../package.json";
import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { debounce } from "ts-debounce";

import { parseText, DocumentSemanticTokensProvider, legend } from './parse-text';
import { updateDiagnostics } from './diagnostics';
import { tweeProjectConfig, changeStoryFormat } from './twee-project';

import { sendPassageDataToClient, toUpdatePassage, updatePassages, focusPassage } from "./story-map/socket";
import { startUI, stopUI, storyMapIO } from "./story-map";

import { fileGlob } from './file-ops';

import { PassageSymbolProvider, PassageListProvider, Passage, jumpToPassage, WorkspacePassageSymbolProvider, passageAtCursor, getWorkspacePassages } from './passage';

import * as formatting from "./formatting";

import * as sugarcube2Language from './sugarcube-2/configuration';
import * as sugarcube2CodeActions from './sugarcube-2/code-actions';
import * as sugarcube2Macros from './sugarcube-2/macros';
import { packer } from './story-map/packer';

import { passageCounter } from './status-bar';
import { wordCounter } from './status-bar';
import { sbStoryMapConfirmationDialog } from './status-bar';
import { updateDecorations, updateTextEditorDecorations } from './decorations';
import { tabstring } from './utils';

import { activateFolding } from './folding';
//#endregion

const documentSelector: vscode.DocumentSelector = {
	pattern: "**/*.{tw,twee}",
};

const configurationSelector: vscode.DocumentSelector = {
	pattern: "**/*twee-config.{yml,json}",
};

export const PackageLanguages = PackageContributions.languages.map(el => el.id);

export const log = vscode.window.createOutputChannel("Twee3 Language Tools (Log)", { log: true });

// Helper function to retry opening a document with exponential backoff
async function openTextDocumentWithRetry(file: vscode.Uri, maxAttempts: number = 4, baseDelay: number = 100): Promise<vscode.TextDocument> {
	let lastError: any;
	
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await vscode.workspace.openTextDocument(file);
		} catch (error) {
			lastError = error;
			
			if (attempt === maxAttempts) {
				throw error;
			}
			
			// Exponential backoff: 100ms, 200ms, 400ms, etc.
			const delay = baseDelay * Math.pow(2, attempt - 1);
			log.debug(`[Startup] Attempt ${attempt}/${maxAttempts} failed to open "${file}": ${error}. Retrying in ${delay}ms...`);
			
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}
	
	throw lastError;
}

export async function activate(ctx: vscode.ExtensionContext) {
	vscode.commands.executeCommand('setContext', 't3lt.extensionActive', true);
	
	ctx.subscriptions.push(log);
	log.info(`[Startup]\n\t\tTwee3 Language Tools active`);

	const sbPassageCounter = passageCounter(ctx);
	const sbWordCounter = await wordCounter(ctx);

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

	// Long operations are file opening, file saving, workspaceState updates, and updateDiagnostics.
	// changeStoryFormat *MUST* be finished before prepare can be considered "done"
	async function prepare() {
		const settings = vscode.workspace.getConfiguration("twee3LanguageTools.loadDocument");
		const maxRetries: number = settings.get("maxRetries") || 4;
		const baseWait: number = settings.get("baseWait") || 100;
		const fg = fileGlob();
		let filePromises: Thenable<vscode.TextDocument>[] = [];
		let allPassages: Thenable<Passage[]>[] = [];

		log.info(`[Startup] Parsing documents`);
		for (const file of fg) {
			let document: vscode.TextDocument;
			log.trace(`[Startup] Opening document: "${file}"`);
			const newPassages: Thenable<Passage[]> = new Promise(resolve => {
				filePromises.push(openTextDocumentWithRetry(vscode.Uri.file(file), maxRetries, baseWait)
					.then(
						(doc) => {
							document = doc;
							log.trace(`[Startup] Parsing document: "${document.uri.path}"`);
							return parseText(ctx, document, resolve);
						},
						(reason) => {
							log.error(`[Startup] Error parsing ${file}: ${reason}`);
							return resolve([]);
						}
					)
					.then(_p => {
						return document;
					})
				);
			});
			allPassages.push(newPassages);
		}
		
		await Promise.all(allPassages)
			.then(passageArr => {
				const passages = passageArr.flat();
				log.info(`[Startup] Updating passage store with ${passages.length} passage(s) from ${passageArr.filter(f => f.length).length} file(s)`);
				return ctx.workspaceState.update("passages", passages);
			}).then(() => {
				passageCounter(ctx, sbPassageCounter);
				if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
				return tweeProjectConfig(ctx);
			});
		
		log.info(`[Startup] Updating storyformat and diagnostics`);
		const results = (await Promise.allSettled(filePromises)).filter(e => e.status === "fulfilled").map(e => e.value);
		await Promise.all(results.map(document => {
			if (document) {
				log.trace(`[Startup] Updating storyformat and diagnostics "${document.uri.path}"`);
				return changeStoryFormat(document).then(d => updateDiagnostics(ctx, d, collection));
			}
			return null;
		}));
		
		wordCounter(ctx, sbWordCounter);
	}

	await prepare();

	const storyMap: storyMapIO = { client: undefined, server: undefined, disconnectTimeout: undefined };

	const startUIWrapper = () => startUI(ctx, storyMap);
	const stopUIWrapper = () => stopUI(ctx, storyMap);

	const mapShowCommand = vscode.commands.registerCommand("twee3LanguageTools.storyMap.show", startUIWrapper);
	const mapStopCommand = vscode.commands.registerCommand("twee3LanguageTools.storyMap.stop", stopUIWrapper);

	if (
		vscode.workspace.getConfiguration("twee3LanguageTools.storyMap").get("restoreStoryMapOnLaunch") &&
		ctx.workspaceState.get("story-map.open", false)
	) {
		startUIWrapper();
	}

	const passageList = vscode.window.createTreeView("t3lt-passages-list", {
		showCollapseAll: true,
		treeDataProvider: passageListProvider
	});

	const createDebouncedParseTextAndDiagnostics = () => {
		const parseTextConfig = vscode.workspace.getConfiguration("twee3LanguageTools.parseText");
		return debounce(async (document: vscode.TextDocument) => {
			log.trace(`[Document changed] Parsing text: "${document.uri.path}"`);
			await parseText(ctx, document);
			log.trace(`[Document changed] Updating diagnostics: "${document.uri.path}"`);
			updateDiagnostics(ctx, document, collection); 
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
		}, parseTextConfig.get("wait", 500), { maxWait: parseTextConfig.get("maxWait", 2000) });
	}
	let debouncedParseTextAndDiagnostics = createDebouncedParseTextAndDiagnostics();

	ctx.subscriptions.push(
		mapShowCommand, mapStopCommand, sbPassageCounter,
		vscode.languages.registerDocumentSemanticTokensProvider(documentSelector, new DocumentSemanticTokensProvider(ctx), legend)
		,
		vscode.languages.registerDocumentSymbolProvider(documentSelector, new PassageSymbolProvider(ctx))
		,
		vscode.languages.registerWorkspaceSymbolProvider(new WorkspacePassageSymbolProvider(ctx))
		,
		vscode.languages.registerHoverProvider(documentSelector, {
			provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
				switch (document.languageId) {
					case sugarcube2Language.LanguageID: return sugarcube2Macros.hover(document, position, token);
					default: return null;
				}
			}
		})
		,
		vscode.languages.registerDefinitionProvider(documentSelector, {
			provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition|vscode.LocationLink[]> {
					return sugarcube2Macros.definition(ctx, document, position, token);
			},
		})
		,
		vscode.languages.registerDefinitionProvider(configurationSelector, {
			provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition|vscode.LocationLink[]> {
					return sugarcube2Macros.definitionConfig(ctx, document, position, token);
			},
		})
		,
		vscode.window.onDidChangeTextEditorSelection(async (e) => {
			if (e.textEditor.document.languageId === sugarcube2Language.LanguageID && vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.features").get("macroTagMatching")) {
				let collected = await sugarcube2Macros.collectCache.get(e.textEditor.document);
				let r: vscode.Range[] = [];
				e.selections.forEach(sel => {
					let pos = sel.active;
					let target = collected.macros
						.filter(el => el.open && el.id !== el.pair).reverse()
						.find(el => (new vscode.Range(el.range.start, collected.macros[el.pair].range.end)).contains(pos));
					if (target) {
						r.push(
							new vscode.Range(
								target.range.start,
								target.range.start.translate(0, "<<".length + target.name.length)
							),
							new vscode.Range(
								target.range.end.translate(0, -1 * ">>".length),
								target.range.end
							),
							collected.macros[target.pair].range
						);
					}
				});
				e.textEditor.setDecorations(sugarcube2Macros.macroTagMatchingDecor, r);
			}
		})
		,
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor && /^twee3.*/.test(editor.document.languageId)) {
				log.trace(`[ActiveTextEditor changed] Updating diagnostics: "${editor.document.uri.path}"`);
				updateDiagnostics(ctx, editor.document, collection);
				updateDecorations(ctx, editor);
			}
		})
		,
		vscode.workspace.onDidOpenTextDocument(async document => {
			if (!/^twee3.*/.test(document.languageId)) return;
			log.trace(`[Document opened] Updating diagnostics: "${document.uri.path}"`);
			await changeStoryFormat(document);
			updateDiagnostics(ctx, document, collection);
			updateTextEditorDecorations(ctx);
		})
		,
		vscode.workspace.onDidChangeTextDocument(e => {
			if (!/^twee3.*/.test(e.document.languageId)) return;
			debouncedParseTextAndDiagnostics(e.document);
			updateTextEditorDecorations(ctx);
		})
		,
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration("twee3LanguageTools.storyformat")) {
				fileGlob().forEach(async file => {
					const doc = await openTextDocumentWithRetry(vscode.Uri.file(file));
					await changeStoryFormat(doc);
					updateDiagnostics(ctx, doc, collection);
				});
			}
			if (e.affectsConfiguration("twee3LanguageTools.passage")) {
				passageListProvider.refresh();
			}
			if (e.affectsConfiguration("twee3LanguageTools.directories")) {
				start().then(prepare);
			}
			if (e.affectsConfiguration("twee3LanguageTools.sugarcube-2.cache.argumentInformation") && !vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.cache").get(".argumentInformation")) {
				// The configuration for this setting has been changed and it is now false, so we
				// clear the cache.
				sugarcube2Macros.argumentCache.clear();
			}
			if (e.affectsConfiguration("twee3LanguageTools.sugarcube-2.error.parameterValidation")) {
				// Note: We simply clear the arguments cache to force it to revalidate.
				// This could be done in a more efficient manner, but this is good enough.
				sugarcube2Macros.argumentCache.clear();
			}
			if (e.affectsConfiguration("twee3LanguageTools.sugarcube-2.warning.barewordLinkPassageChecking")) {
				sugarcube2Macros.argumentCache.clearMacrosUsingPassage();
			}
			if (e.affectsConfiguration("twee3LanguageTools.sugarcube-2.definedMacroDecorations")) {
				updateTextEditorDecorations(ctx);
			}
			if (e.affectsConfiguration("twee3LanguageTools.parseText")) {
				debouncedParseTextAndDiagnostics = createDebouncedParseTextAndDiagnostics();
			}
		})
		,
		vscode.workspace.onDidCreateFiles(e => {
			e.files.forEach(file => openTextDocumentWithRetry(file).then((doc) => changeStoryFormat(doc)));
		})
		,
		vscode.workspace.onDidDeleteFiles(e => {
			e.files.forEach(file => sugarcube2Macros.collectCache.clearFilename(file.fsPath));

			const removedFilePaths = e.files.map((file) => file.path);
			const oldPassages: Passage[] = getWorkspacePassages(ctx);
			const newPassages: Passage[] = oldPassages.filter((passage) => !removedFilePaths.includes(passage.origin.full));
			ctx.workspaceState.update("passages", newPassages).then(() => {
				if (storyMap.client) sendPassageDataToClient(ctx, storyMap.client);
				if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
			});
		})
		,
		vscode.workspace.onDidRenameFiles(async e => {
			for (let file of e.files) {
				let doc = await openTextDocumentWithRetry(file.newUri);
				await changeStoryFormat(doc);

				sugarcube2Macros.collectCache.clearFilename(file.oldUri.fsPath);

				let passages: Passage[] = getWorkspacePassages(ctx);
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

			log.trace(`[Document saved] Parsing text: "${document.uri.path}"`);
			await parseText(ctx, document);
			passageCounter(ctx, sbPassageCounter);
			wordCounter(ctx, sbWordCounter);
			
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
			if (storyMap.client) sendPassageDataToClient(ctx, storyMap.client);
			
			tweeProjectConfig(ctx);
		})
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
				const passages = getWorkspacePassages(ctx);
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
		vscode.commands.registerCommand("twee3LanguageTools.sc2.defineMacro", sugarcube2CodeActions.unrecognizedMacroFixCommand)
		,
		vscode.commands.registerCommand("twee3LanguageTools.sc2.clearArgumentCache", () => {
			// Provide a command to clear the argument cache for if there is ever any bugs with the
			// implementation, it can tide users over until a fix.
			sugarcube2Macros.argumentCache.clear();
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.sc2.addAllUnrecognizedMacros", () => {
			sugarcube2CodeActions.addAllUnrecognizedMacros();
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.sc2.addAllUnrecognizedMacrosInFile", async() => {
			let editor = vscode.window.activeTextEditor;
			if (editor) {
				await sugarcube2CodeActions.addAllUnrecognizedMacrosInCurrentFile(editor.document);
			}
		})
		,
		vscode.commands.registerTextEditorCommand("twee3LanguageTools.storyMap.focusPassage", (editor) => focusPassage(ctx, storyMap, editor))
		,
		vscode.commands.registerTextEditorCommand("twee3LanguageTools.passage.setAsStart", async (editor) => {
			const passage = passageAtCursor(ctx, editor);
			if (passage) {
				const passages = getWorkspacePassages(ctx);
				const storyData = passages.find((passage) => passage.name === "StoryData");
				if (storyData) {
					const range = new vscode.Range(storyData.range.start.translate(1), storyData.range.end);
					
					const data: any = ctx.workspaceState.get("StoryData", {});
					data["start"] = passage.name;
					
					const dataString = JSON.stringify(data, null, tabstring()) + "\n\n";

					const edit = new vscode.WorkspaceEdit();
					edit.replace(vscode.Uri.file(storyData.origin.full), range, dataString);

					vscode.workspace.applyEdit(edit);
				}
			}
		})
		,
		// TODO: Allow configuration for which version Harlowe should use since it supports both ''
		// and ** for bold, and // and * for italics
		vscode.commands.registerTextEditorCommand("twee3LanguageTools.toggleItalics", editor => {
			let languageId = editor.document.languageId;
			if (languageId === sugarcube2Language.LanguageID) {
				formatting.styleByWrapping(editor, "//");
			} else if (languageId === "twee3-harlowe-3") {
				formatting.styleByWrapping(editor, "*");
			}
			// TODO: Other story format support
		})
		,
		vscode.commands.registerTextEditorCommand("twee3LanguageTools.toggleBold", (editor, edit) => {
			let languageId = editor.document.languageId;
			if (languageId === sugarcube2Language.LanguageID) {
				formatting.styleByWrapping(editor, "''");
			}  else if (languageId === "twee3-harlowe-3") {
				formatting.styleByWrapping(editor, "**");
			}
			// TODO: Other story format support
		})
		,
		vscode.languages.registerCodeActionsProvider(sugarcube2Language.LanguageID, new sugarcube2CodeActions.EndMacro(), {
			providedCodeActionKinds: sugarcube2CodeActions.EndMacro.providedCodeActionKinds
		})
		,
		vscode.languages.registerCodeActionsProvider(sugarcube2Language.LanguageID, new sugarcube2CodeActions.Unrecognized(), {
			providedCodeActionKinds: sugarcube2CodeActions.Unrecognized.providedCodeActionKinds
		})
		,
		vscode.commands.registerCommand("twee3LanguageTools.passageCounter.clickCheck", sbStoryMapConfirmationDialog)
	);

	// This is needed so that on first load, the active file will get colors.
	updateTextEditorDecorations(ctx);

	activateFolding(ctx);
};