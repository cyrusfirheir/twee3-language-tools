import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import * as glob from 'glob';

import headsplit from './headsplit';

import { parseText } from './parse-text';
import { updateDiagnostics } from './diagnostics';

import { PassageListProvider, Passage } from './tree-view';

import * as sc2m from './sugarcube-2/macros';
import * as sc2ca from './sugarcube-2/code-actions';

import express from 'express';
import * as socketio from 'socket.io';
import path from 'path';
import open from 'open';

import { Server } from 'http';

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

	async function getPassageContent(passage: Passage): Promise<string> {
		const doc = await vscode.workspace.openTextDocument(passage.origin);
		const fileContent = doc.getText();
		const searchPassageRegexp = new RegExp("^::\\s*" + passage.name.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&") + ".*?$", "m");
		const anyPassageRegexp = new RegExp("^::\s*(.*)?(\[.*?\]\s*?)?(\{.*\}\s*)?$", "m");
		const passageStartMatch = fileContent.match(searchPassageRegexp);
		if (!passageStartMatch || !('index' in passageStartMatch)) throw new Error('Cannot find passage title in origin-file');
		const contentStart = (passageStartMatch.index as number) + passageStartMatch[0].length;
		const restOfFile = fileContent.substr(contentStart);
		const nextPassageMatch = restOfFile.match(anyPassageRegexp);
		return restOfFile.substr(0, nextPassageMatch?.index);
	}

	async function getLinkedPassageNames(passage: Passage): Promise<string[]> {
		const passageContent = await getPassageContent(passage);
        const parts = passageContent.split(/\[(?:img)?\[/).slice(1);
        return parts.filter((part) => part.indexOf(']]') !== -1).map((part) => {
			const link = part.split(']').shift() as string;
			if (link.includes("->")) return (link.split("->").pop() as string).trim();
			else if (link.includes("<-")) return (link.split("<-").shift() as string).trim();
			else return (link.split('|').pop() as string).trim();
		});
	};

	async function sendPassagesToClient(client: socketio.Socket) {
		const rawPassages = await (ctx.workspaceState.get("passages", []) as Passage[]);
		const passagePromises = rawPassages.map(async (passage) => {
			const linksToNames = await getLinkedPassageNames(passage);
			return {
				origin: passage.origin,
				name: passage.name,
				tags: passage.tags,
				meta: passage.meta,
				linksToNames,
			};
		});
		const passages = await Promise.all(passagePromises);
		console.log(`Sending ${passages.length} passages to client`);
		client.emit('passages', passages);
	}

	type Vector = { x: number; y: number; };
	type UpdatePassage = { name: string; origin: string; position: Vector; size: Vector; tags?: string[] };
	async function updatePassages(passages: UpdatePassage[]) {
		const files = [... new Set(passages.map(passage => passage.origin))];
		for (const file of files) {
			const doc = await vscode.workspace.openTextDocument(file);
			await doc.save();
			let edited = doc.getText();

			const filePassages = passages.filter(el => el.origin === file);
			for (const passage of filePassages) {
				const regexp = new RegExp(
					"^::\\s*" +
					passage.name.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&") +
					".*?$"
				, "m");

				let pMeta: any = { position: `${passage.position.x},${passage.position.y}` };
				if (passage.size.x !== 100 || passage.size.y !== 100) pMeta.size = `${passage.size.x},${passage.size.y}`;

				edited = edited.replace(regexp, `:: ${passage.name} ` + (passage.tags?.length ? `[${passage.tags.join(" ")}] ` : "") + JSON.stringify(pMeta));
			}

			await vscode.workspace.fs.writeFile(doc.uri, Buffer.from(edited));
		}
	}

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
			// Good to know
			console.log('client connected');
			// Lets give them info
			sendPassagesToClient(client);

			// Listen for client commands
			client.on('open-passage', jumpToPassage);
			client.on('update-passages', updatePassages);
			// When they disconnect, we're done
			client.on('disconnect', () => {
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
			for (let file of e.files) {
				const oldPassages: Passage[] = ctx.workspaceState.get("passages", []);
				const passages = oldPassages.filter(el => el.origin !== file.path);
				ctx.workspaceState.update("passages", passages).then(() => passageListProvider.refresh());
			}

			const removedFilePaths = e.files.map((file) => file.path);
			const oldPassages: Passage[] = ctx.workspaceState.get("passages", []);
			const newPassages: Passage[] = oldPassages.filter((passage) => !removedFilePaths.includes(passage.origin));
			ctx.workspaceState.update("passages", newPassages).then(() => passageListProvider.refresh());

			for (let file of e.files) {
				const passages = oldPassages.filter(el => el.origin !== file.path);
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
				// Do passages get serialized when reading/updating? If not, you shouldn't need to update this right?
				await ctx.workspaceState.update("passages", passages);
				passageListProvider.refresh();
			}
		})
		,
		vscode.workspace.onDidSaveTextDocument(document => {
			// What does this actually do?
			tweeProjectConfig(document);
			// okay so this is something to do with parsing the current file for
			// like some UI element that deals with the on-screen passage?
			if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) {
				// I think your functions should often use return value more often
				parseText(ctx, document, passageListProvider);
			}
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
		// Neat
		vscode.commands.registerCommand("twee3LanguageTools.passage.jump", (item: Passage) => {
			jumpToPassage(item);
		})
		,
		// is this just inverting the value?
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
		// Do you want the code I have for parsing macros? It actually works quite well
		,
		// should I look at what this does?
		vscode.commands.registerCommand("twee3LanguageTools.sc2.defineMacro", sc2ca.unrecognizedMacroFixCommand)
		,
		// what are these code action things? are they like "right click -> add to definiton file"?
		vscode.languages.registerCodeActionsProvider("twee3-sugarcube-2", new sc2ca.EndMacro(), {
			providedCodeActionKinds: sc2ca.EndMacro.providedCodeActionKinds
		})
		,
		vscode.languages.registerCodeActionsProvider("twee3-sugarcube-2", new sc2ca.Unrecognized(), {
			providedCodeActionKinds: sc2ca.Unrecognized.providedCodeActionKinds
		})
	);
};