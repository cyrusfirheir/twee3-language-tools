// Imports
//#region 
import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import * as glob from 'glob';

import express from 'express';
import path from 'path';
import open from 'open';
import { Server } from 'http';
import * as socketio from 'socket.io';

import { parseText } from './parse-text';
import { updateDiagnostics } from './diagnostics';
import { tweeProjectConfig, changeStoryFormat } from './tweeProject';
import { updatePassages, sendPassageDataToClient } from "./socket";

import { PassageListProvider, Passage, jumpToPassage } from './tree-view';

import * as sc2m from './sugarcube-2/macros';
import * as sc2ca from './sugarcube-2/code-actions';
//#endregion

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

const documentSelector: vscode.DocumentSelector = {
	pattern: "**/*.{tw,twee}",
};

export async function activate(context: vscode.ExtensionContext) {
	vscode.commands.executeCommand('setContext', 't3lt.extensionActive', true);

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
				files = [...files, ...glob.sync(el.uri.fsPath + "/" + elem + "/**/*.{tw,twee}", { ignore: exclude })];
			})
		});
		return files;
	}

	function prepare(file: string) {
		vscode.workspace.openTextDocument(file).then(async doc => {
			tweeProjectConfig(doc);
			updateDiagnostics(ctx, doc, collection);
			await parseText(ctx, doc);
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
		})
	}

	fileGlob().forEach(file => prepare(file));

	if (!vscode.workspace.getConfiguration("editor").get("semanticTokenColorCustomizations.enabled")) {
		vscode.workspace.getConfiguration("editor").update("semanticTokenColorCustomizations", {
			"enabled": true
		}, true);
	}

	interface storyMapIO {
		client: socketio.Socket | undefined;
		server: Server | undefined;
		disconnectTimeout: NodeJS.Timeout | undefined;
	}
	const storyMap: storyMapIO = { client: undefined, server: undefined, disconnectTimeout: undefined };

	function startUI() {
		const port = 42069;

		const hostUrl = `http://localhost:${port}/`
		const storyMapPath = path.join(ctx.extensionPath, 'res/story-map');

		const app = express();
		app.use(express.static(storyMapPath));

		storyMap.server = new Server(app);
		storyMap.server.listen(port, () => console.log(`Server connected on ${hostUrl}`));

		const io = new socketio.Server(storyMap.server, { cors: { origin: 'http://localhost:8080' } });
		io.on('connection', (client: socketio.Socket) => {
			if (storyMap.client) storyMap.client.disconnect(true);
			if (storyMap.disconnectTimeout) clearTimeout(storyMap.disconnectTimeout);

			storyMap.client = client;
			console.log('client connected');
			sendPassageDataToClient(ctx, client);

			client.on('open-passage', jumpToPassage);
			client.on('update-passages', updatePassages);
			client.on('disconnect', () => {
				console.log('client disconnected');
				storyMap.client = undefined;
				storyMap.disconnectTimeout = setTimeout(() => {
					if (!storyMap.client) stopUI();
				}, vscode.workspace.getConfiguration("twee3LanguageTools.storyMap").get("unusedPortClosingDelay", 5000));
			});
		});
		open(hostUrl);
		vscode.commands.executeCommand('setContext', 't3lt.storyMap', true);
	}

	function stopUI() {
		storyMap.client?.disconnect(true);
		storyMap.server?.close(() => vscode.commands.executeCommand('setContext', 't3lt.storyMap', false));
	}

	const mapShowCommand = vscode.commands.registerCommand("twee3LanguageTools.storyMap.show", startUI);
	const mapStopCommand = vscode.commands.registerCommand("twee3LanguageTools.storyMap.stop", stopUI);

	ctx.subscriptions.push(
		mapShowCommand, mapStopCommand,
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
				e.textEditor.setDecorations(sc2m.decor, r);
			}
		})
		,
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				updateDiagnostics(ctx, editor.document, collection);
			}
		})
		,
		vscode.workspace.onDidOpenTextDocument(document => {
			changeStoryFormat(document);
			updateDiagnostics(ctx, document, collection);
		})
		,
		vscode.workspace.onDidChangeTextDocument(e => {
			updateDiagnostics(ctx, e.document, collection);
		})
		,
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration("twee3LanguageTools.storyformat")) {
				fileGlob().forEach(file => {
					vscode.workspace.openTextDocument(file).then(doc => {
						changeStoryFormat(doc);
						updateDiagnostics(ctx, doc, collection);
					})
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
				passageListProvider.refresh()
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
			tweeProjectConfig(document);
			await parseText(ctx, document);
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
			if (storyMap.client) sendPassageDataToClient(ctx, storyMap.client);
		})
		,
		vscode.window.registerTreeDataProvider(
			't3lt-passages-list',
			passageListProvider
		)
		,
		vscode.commands.registerCommand("twee3LanguageTools.refreshDiagnostics", () => {
			let doc = vscode.window.activeTextEditor?.document;
			if (doc) updateDiagnostics(ctx, doc, collection);
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
		vscode.languages.registerCodeActionsProvider("twee3-sugarcube-2", new sc2ca.EndMacro(), {
			providedCodeActionKinds: sc2ca.EndMacro.providedCodeActionKinds
		})
		,
		vscode.languages.registerCodeActionsProvider("twee3-sugarcube-2", new sc2ca.Unrecognized(), {
			providedCodeActionKinds: sc2ca.Unrecognized.providedCodeActionKinds
		})
	);
};