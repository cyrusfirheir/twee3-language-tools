import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import headsplit from './headsplit';
import * as sc2 from "./sugarcube-2/completions";
import { collectDocumentation } from './collectDocs';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient';
import { performance } from 'perf_hooks';

let ctx: vscode.ExtensionContext;

import { URL } from 'url';

let client: LanguageClient;

const tokenTypes = new Map<string, number>();
const tokenModifiers = new Map<string, number>();

const legend = (function () {
	const tokenTypesLegend: string[] = [
		"startToken", "passageName", "passageTags", "passageMeta", "special", "comment"
	];
	tokenTypesLegend.forEach((tokenType, index) => tokenTypes.set(tokenType, index));

	const tokenModifiersLegend: string[] = [

	];
	tokenModifiersLegend.forEach((tokenModifier, index) => tokenModifiers.set(tokenModifier, index));
	return new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend);
})();

interface IParsedToken {
	line: number;
	startCharacter: number;
	length: number;
	tokenType: string;
	tokenModifiers: string[];
}

class DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
	async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
		const allTokens = this._parseText(document.getText());
		const builder = new vscode.SemanticTokensBuilder();
		allTokens.forEach((token) => {
			builder.push(token.line, token.startCharacter, token.length, this._encodeTokenType(token.tokenType), this._encodeTokenModifiers(token.tokenModifiers));
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

	private _encodeTokenModifiers(strTokenModifiers: string[]): number {
		let result = 0;
		for (let i = 0; i < strTokenModifiers.length; i++) {
			const tokenModifier = strTokenModifiers[i];
			if (tokenModifiers.has(tokenModifier)) {
				result = result | (1 << tokenModifiers.get(tokenModifier)!);
			} else if (tokenModifier === 'notInLegend') {
				result = result | (1 << tokenModifiers.size + 2);
			}
		}
		return result;
	}

	private _parseText(text: string): IParsedToken[] {
		const r: IParsedToken[] = [];
		const lines = text.split(/\r?\n/);
		lines.forEach((line, i) => {
			if (line.startsWith("::")) {
				const escaped = line.replace(/\\./g, "ec"); // escaped characters

				const oTag = escaped.indexOf("[");
				const cTag = escaped.indexOf("]");
				const oMeta = escaped.indexOf("{");
				const cMeta = escaped.indexOf("}");
				const tag = cTag > oTag;
				const meta = cMeta > oMeta;

				const nameLength = oTag > 0
					? oMeta > 0
						? oMeta > oTag
							? oTag - 2
							: oMeta - 2
						: oTag - 2
					: oMeta > 0
						? oMeta - 2
						: line.length;

				if (!(
					escaped.substring(2, 2 + nameLength).match(/[}\]]/g) ||
					escaped.split("[").length - 1 > 1 ||
					escaped.split("{").length - 1 > 1 ||
					oTag > 0 && !tag ||
					oMeta > 0 && !meta ||
					oMeta > 0 && oMeta < oTag
				)) {
					const passageName = line.substring(2, 2 + nameLength).trim();
					const specialName = [
						"StoryTitle",
						"StoryData",
						"Start"
					].includes(passageName);

					r.push({
						line: i, startCharacter: 0, length: 2, tokenType: "startToken", tokenModifiers: []
					}, {
						line: i, startCharacter: 2, length: nameLength,
						tokenType: specialName ? "special" : "passageName",
						tokenModifiers: []
					});

					if (oTag > 0) {
						const passageTags = line.substring(oTag + 1, cTag).trim();
						const specialTag = [
							"script",
							"stylesheet"
						].includes(passageTags);

						r.push({
							line: i, startCharacter: oTag, length: 1, tokenType: "comment", tokenModifiers: []
						}, {
							line: i, startCharacter: oTag + 1, length: cTag - oTag - 1,
							tokenType: specialTag ? "special" : "passageTags",
							tokenModifiers: []
						}, {
							line: i, startCharacter: cTag, length: 1, tokenType: "comment", tokenModifiers: []
						});
					}

					if (oMeta > 0) {
						r.push({
							line: i, startCharacter: oMeta, length: 1, tokenType: "comment", tokenModifiers: []
						}, {
							line: i, startCharacter: oMeta + 1, length: cMeta - oMeta - 1, tokenType: "passageMeta", tokenModifiers: []
						}, {
							line: i, startCharacter: cMeta, length: 1, tokenType: "comment", tokenModifiers: []
						});
					}
				}
			}
		});
		return r;
	}
}

<<<<<<< HEAD
const tweeProjectConfig = async function (document: vscode.TextDocument) {
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
	const config = vscode.workspace.getConfiguration("twee3LanguageTools.storyformat");
	const fName = formatInfo.format;
	const fVersion = formatInfo["format-version"];
	console.log(performance.now() + " project config set - " + document.fileName)
	return Promise.all([
		config.update("id", fName.toLowerCase() + "-" + fVersion.split(".")[0]),
		config.update("name", fName),
		config.update("version", fVersion)
	]);
=======
const tweeProjectConfig = function (document: vscode.TextDocument) {
	const raw = document.getText();
	if (raw.match(/^::\s*StoryData\b/gm)) {
		const storydata = headsplit(raw, /^::(.*)/).find(el => el.header === "StoryData");
		if (storydata?.content) {
			try {
				const formatInfo = JSON.parse(storydata.content);
				const config = vscode.workspace.getConfiguration("twee3LanguageTools.storyformat");
				const fName = formatInfo.format;
				const fVersion = formatInfo["format-version"];
				return Promise.all([
					config.update("id", fName.toLowerCase() + "-" + fVersion.split(".")[0]),
					config.update("name", fName),
					config.update("version", fVersion)
				]);
			} catch {
				vscode.window.showErrorMessage("Malformed StoryData JSON!");
				return new Promise(res => res());
			}
		}
	}
	return new Promise(res => res());
>>>>>>> parent of acb069b... Revert "jsdoc branch"
};

const changeStoryFormat = async function (document: vscode.TextDocument) {
	let format: string = "";

	const config = vscode.workspace.getConfiguration("twee3LanguageTools.storyformat");
	const override: string = config.get("override") || "";

	if (!override) format = "twee3-" + config.get("id");
	else format = "twee3-" + override;
<<<<<<< HEAD

	const langs = await vscode.languages.getLanguages();
	if (!langs.includes(format)) format = "twee3";

	if (
		document.fileName.match(/\.tw(?:ee)?$/) &&
		document.languageId !== format
	) return vscode.languages.setTextDocumentLanguage(document, format);
	else return new Promise(res => res(document));
};

=======

	const langs = await vscode.languages.getLanguages();
	if (!langs.includes(format)) format = "twee3";
	
	if (
		document.fileName.match(/\.tw(?:ee)?$/) &&
		document.languageId !== format
	) return vscode.languages.setTextDocumentLanguage(document, format);
	else return new Promise(res => res(document));
};

>>>>>>> parent of acb069b... Revert "jsdoc branch"
vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
	changeStoryFormat(document);
});

vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
<<<<<<< HEAD
	collectDocumentation(ctx, document.getText());
	tweeProjectConfig(document)
		.then(() => changeStoryFormat(document));
});

export function activate(context: vscode.ExtensionContext) {
	ctx = context;

	const pkg = JSON.parse(fs.readFileSync(path.join(ctx.extensionPath, "package.json"), "utf8"));
	const formats = pkg.contributes.languages.map((el: { id: any }) => el.id);

	vscode.workspace.findFiles("**/*.tw*").then(async v => {
		for (let file of v) {
			const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file.path));
			await tweeProjectConfig(doc);
			await collectDocumentation(ctx, doc.getText());
			console.log(performance.now() + " documentation collected - " + doc.fileName);
		}
		for (let file of v) {
			const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file.path));
			await changeStoryFormat(doc);
			console.log(performance.now() + " format changed - " + doc.fileName);
		}
	});
	

	vscode.workspace.findFiles("**/*.d.{js,ts}", "**/node_modules/**").then(async v => {
		for (let file of v) {
			const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file.path));
			await collectDocumentation(ctx, doc.getText());
		}
	});

=======
	tweeProjectConfig(document)
		.then(() => changeStoryFormat(document))
		.then(() => collectDocumentation(document.getText()));
});

export function activate(context: vscode.ExtensionContext) {

	const ws = vscode.workspace.workspaceFolders?.[0].uri.path;
    if (ws) {
		const wsURL = new URL("file://" + ws + "/.vscode/.t3lt_temp.json");
		fs.writeFileSync(wsURL, "{}", "utf8");
	}

	const pkg = JSON.parse(fs.readFileSync(path.join(context.extensionPath, "package.json"), "utf8"));
	const formats = pkg.contributes.languages.map((el: { id: any; }) => el.id);	

	vscode.workspace.findFiles("**/*.tw*").then(v => {
		v.forEach(file => {
			vscode.workspace.openTextDocument(vscode.Uri.file(file.path)).then(document => {
				tweeProjectConfig(document)
					.then(() => changeStoryFormat(document))
					.then(() => collectDocumentation(document.getText()));
			});
		});
	});

	vscode.workspace.findFiles("**/*.d.{js,ts}", "**/node_modules/**").then(v => {
		v.forEach(file => {
			vscode.workspace.openTextDocument(vscode.Uri.file(file.path)).then(document => {
				collectDocumentation(document.getText());
			});
		});
	});
	
>>>>>>> parent of acb069b... Revert "jsdoc branch"
	if (!vscode.workspace.getConfiguration("editor").get("semanticTokenColorCustomizations.enabled")) {
		vscode.workspace.getConfiguration("editor").update("semanticTokenColorCustomizations", {
			"enabled": true
		}, true);
	}

<<<<<<< HEAD
	ctx.subscriptions.push(
		vscode.languages.registerDocumentSemanticTokensProvider(formats.map((el: string) => {
			return { language: el };
		}), new DocumentSemanticTokensProvider(), legend)
		,
		vscode.languages.registerCompletionItemProvider('twee3-sugarcube-2', {
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
				return sc2.completion(ctx);
=======
	context.subscriptions.push(
		vscode.languages.registerDocumentSemanticTokensProvider(formats.map((el: string) => {
			return { language: el };
		}), new DocumentSemanticTokensProvider(), legend)
	,
		vscode.languages.registerCompletionItemProvider('twee3-sugarcube-2', {
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
				return sc2.completion();
>>>>>>> parent of acb069b... Revert "jsdoc branch"
			}
		})
	);

	/************************************************************************************************
	 *  LSP - Will be removed
	 ************************************************************************************************
	 */

	let serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	let clientOptions: LanguageClientOptions = {
		documentSelector: formats.map((el: string) => {
			return { scheme: "file", language: el };
		}),
		synchronize: {
			fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	client = new LanguageClient(
		'twee3-language-server',
		'Twee 3 Language Server',
		serverOptions,
		clientOptions
	);

	client.start();
}

export function deactivate(): Thenable<void> | undefined {
<<<<<<< HEAD
	ctx.workspaceState.update("jsdocs", {});

=======
	const ws = vscode.workspace.workspaceFolders;
	if (ws) fs.unlink(new URL("file://" + ws[0].uri.path + "/.t3lt_temp.json"), (err) => {
		if (err) throw err;
	});
>>>>>>> parent of acb069b... Revert "jsdoc branch"
	if (!client) {
		return undefined;
	}
	return client.stop();
}