import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import headsplit from "./headsplit";

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient';

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
		lines.forEach( (line, i) => {
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

const changeStoryFormat = function() {
	let format: string = "";
	const _formatInfo = vscode.workspace.getConfiguration("twee3LanguageTools");
	const _override: string = _formatInfo.get("formatOverride") || "";
	if (!_override) {
		const _format: string = _formatInfo.get("format") || "";
		const _version: string = _formatInfo.get("formatVersion") || "";
		format = "twee3-" + _format.toLowerCase() + "-" + _version.split(".")[0];
	} else format = "twee3-" + _override;
	vscode.languages.getLanguages().then(langs => {
		if (!langs.includes(format)) format = "twee3";
		vscode.workspace.findFiles("**/*.tw*").then(v => {
			v.forEach(file => {
				vscode.workspace.openTextDocument(vscode.Uri.file(file.path)).then(document => {
					vscode.languages.setTextDocumentLanguage(document, format);
				});
			});
		});
	});
};

const tweeProjectConfig = function (document: vscode.TextDocument) {
	const raw = document.getText();
	if (!raw.match(/^::\s*StoryData\b/gm)) return;
	const storydata = headsplit(raw, /^::(.*)/).find(el => el.header === "StoryData");
	if (storydata?.content) {
		try {
			const _formatInfo = JSON.parse(storydata.content);
			vscode.workspace.getConfiguration("twee3LanguageTools")
				.update("format", _formatInfo.format);
			vscode.workspace.getConfiguration("twee3LanguageTools")
				.update("formatVersion", _formatInfo["format-version"]);
		} catch {
			vscode.window.showErrorMessage("Malformed StoryData JSON!");
		}
	}
};

vscode.workspace.onDidOpenTextDocument(() => {
	changeStoryFormat();
});

vscode.workspace.onDidChangeTextDocument(e => {
	tweeProjectConfig(e.document);
});

vscode.workspace.onDidChangeConfiguration(() => {
	changeStoryFormat();
});

export function activate(context: vscode.ExtensionContext) {
	
	const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
	const formats = pkg.contributes.languages.map((el: { id: any; }) => el.id);	

	vscode.workspace.findFiles("**/*.tw*").then(v => {
		v.forEach(file => {
			vscode.workspace.openTextDocument(vscode.Uri.file(file.path)).then(document => {
				tweeProjectConfig(document);
			});
		});
	});

	let serverModule = context.asAbsolutePath(
		path.join('out', 'server.js')
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

	if (!vscode.workspace.getConfiguration("editor").get("semanticTokenColorCustomizations.enabled")) {
		vscode.workspace.getConfiguration("editor").update("semanticTokenColorCustomizations", {
			"enabled": true
		}, true);
	}

	context.subscriptions.push(
		vscode.languages.registerDocumentSemanticTokensProvider(formats.map((el: string) => {
			return { language: el };
		}), new DocumentSemanticTokensProvider(), legend)
	);
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}