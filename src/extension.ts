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
import { tweeProjectConfig, changeStoryFormat } from "./tweeProject";
import { updatePassages, sendPassagesToClient } from "./socket";

import { PassageListProvider, Passage } from './tree-view';

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

	// This seems kind of like an init file
	function prepare(file: string) {
		vscode.workspace.openTextDocument(file).then(async doc => {
			tweeProjectConfig(doc);
			updateDiagnostics(doc, collection);
			await parseText(ctx, doc);
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
		})
	}

	fileGlob().forEach(file => prepare(file));

	// Isnt this just going to turn a setting on if its off? why?
	if (!vscode.workspace.getConfiguration("editor").get("semanticTokenColorCustomizations.enabled")) {
		vscode.workspace.getConfiguration("editor").update("semanticTokenColorCustomizations", {
			"enabled": true
		}, true);
	}

	function jumpToPassage(passage: { name: string; origin: string }) {
		vscode.window.showTextDocument(vscode.Uri.file(passage.origin)).then(editor => {
			const regexp = new RegExp(
				"^::\\s*" +
				passage.name.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&") +
				"\\s*(\\[|\\{|$)"
			);
			const lines = editor.document.getText().split(/\r?\n/);
			const start = Math.max(0, lines.findIndex(el => regexp.test(el)));
			editor.revealRange(new vscode.Range(start, 0, start, 0), vscode.TextEditorRevealType.AtTop);
		});
	}

	
	let storyMapClient: socketio.Socket | undefined = undefined;

	function startUI() {
		// Config
		const port = 42069;
		// Prep
		const hostUrl = `http://localhost:${port}/`
		const storyMapPath = path.join(ctx.extensionPath, 'res/story-map');
		// Http server
		const app = express();
		app.use(express.static(storyMapPath));
	
		const httpServer = new Server(app);
		httpServer.listen(port, () => console.log(`Server bla ${hostUrl}`));
		// open browser
		const io = new socketio.Server(httpServer, {
			cors: { origin: '*' }, // This Cors stuff should probably only be on in dev mode
		});
		io.on('connection', (client: socketio.Socket) => {
			storyMapClient = client;
			// Good to know
			console.log('client connected');
			// Lets give them info
			sendPassagesToClient(ctx, client);
	
			// Listen for client commands
			client.on('open-passage', jumpToPassage);
			client.on('update-passages', updatePassages);
			// When they disconnect, we're done
			client.on('disconnect', () => {
				storyMapClient = undefined;
				console.log('client disconnected');
				// io.close(); // I kinda think this is a good idea, but its annoying for dev mode
			})
		});
		io.listen(port);
		open(hostUrl);
	}

	// Add a command that can be used to start the twee-gui
	const guiCommandSubscription = vscode.commands.registerCommand("twee3LanguageTools.UI.show", startUI);

	ctx.subscriptions.push(
		guiCommandSubscription, // does the order of subscriptions added matter?
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
		// Note to self, what is this? Just see when a different file is opened/switched to? or when the window receives focus?
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
		// What is this gonna do?
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
				if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) {
					fileGlob().forEach(file => {
						// are we opening all the files? whats up?
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
		// So when we create a file, we open  it; but then changeStoryFormat? Wut?
		vscode.workspace.onDidCreateFiles(e => {
			e.files.forEach(file => vscode.workspace.openTextDocument(file).then((doc) => changeStoryFormat(doc)));
		})
		,
		vscode.workspace.onDidDeleteFiles(e => {
			const removedFilePaths = e.files.map((file) => file.path);
			const oldPassages: Passage[] = ctx.workspaceState.get("passages", []);
			const newPassages: Passage[] = oldPassages.filter((passage) => !removedFilePaths.includes(passage.origin));
			ctx.workspaceState.update("passages", newPassages).then(() => {
				if (storyMapClient) sendPassagesToClient(ctx, storyMapClient);
				passageListProvider.refresh()
			});
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
				if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
				if (storyMapClient) sendPassagesToClient(ctx, storyMapClient);
			}
		})
		,
		vscode.workspace.onDidSaveTextDocument(async document => {
			tweeProjectConfig(document);
			await parseText(ctx, document);
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) passageListProvider.refresh();
			if (storyMapClient) sendPassagesToClient(ctx, storyMapClient);
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
		vscode.languages.registerCodeActionsProvider("twee3-sugarcube-2", new sc2ca.EndMacro(), {
			providedCodeActionKinds: sc2ca.EndMacro.providedCodeActionKinds
		})
		,
		vscode.languages.registerCodeActionsProvider("twee3-sugarcube-2", new sc2ca.Unrecognized(), {
			providedCodeActionKinds: sc2ca.Unrecognized.providedCodeActionKinds
		})
	);
};