import * as vscode from "vscode";
import { Passage, PassageListProvider } from "./passage";
import * as sc2m from "./sugarcube-2/macros";

interface IParsedToken {
	line: number;
	startCharacter: number;
	length: number;
	tokenType: string;
	tokenModifiers: string[];
}

export const passageHeaderRegex = /(^::\s*)(.*?)(\[.*?\]\s*)?(\{.*?\}\s*)?\r?$/;

export interface RawDocument {
	text: string;
	uri: vscode.Uri;
	languageId: vscode.TextDocument["languageId"];
}

export async function parseRawText(context: vscode.ExtensionContext, document: RawDocument, provider?: PassageListProvider): Promise<IParsedToken[]> {
	const StoryData: any = context.workspaceState.get("StoryData", {});
	const passages = (context.workspaceState.get("passages", []) as Passage[]).filter(el => el.origin.full !== document.uri.path);
	const newPassages: Passage[] = [];

	const r: IParsedToken[] = [];

	const lineIndices: number[] = [0];
	let lastIndex = document.text.indexOf("\n");

	const firstLineOnlyLine = lastIndex === -1;
	const firstCharNotNewline = lastIndex > 0;
	
	let firstPass = firstLineOnlyLine || firstCharNotNewline;
	if (firstPass) {
		lastIndex = -1;
		lineIndices.pop();
	}

	do {
		const i = lineIndices.length;
		lineIndices.push(lastIndex);

		const curStart = lastIndex + 1;
		let curEnd = document.text.indexOf("\n", curStart);

		lastIndex = curEnd;

		if (curEnd === -1) curEnd = document.text.length;

		const line = document.text.slice(curStart, curEnd);

		let escaped = line.replace(/\\./g, "ec"); // escaped characters

		let passageName: string = "", passageTags: string[] = [], passageMeta: any = null;

		const execArr = passageHeaderRegex.exec(escaped);
		if (execArr) {
			const reStartToken = execArr[1] || "";
			const reName = reStartToken + (execArr[2] || "");
			const reTags = reName + (execArr[3] || "");
			const reMeta = reTags + (execArr[4] || "");

			let _metaString = line.substring(reTags.length, reMeta.length).trim();
			try {
				passageMeta = JSON.parse(_metaString || "null");
			} catch {
				// console.error("Invalid Passage meta JSON!");
				continue;
			}
			if (passageMeta) {
				r.push({
					line: i, startCharacter: reTags.length, length: 1, tokenType: "comment", tokenModifiers: []
				}, {
					line: i, startCharacter: reTags.length + 1, length: _metaString.length - 2,
					tokenType: "passageMeta", tokenModifiers: []
				}, {
					line: i, startCharacter: (reTags + _metaString).length - 1, length: 1, tokenType: "comment", tokenModifiers: []
				});
			}

			let _tagString = line.substring(reName.length, reTags.length).trim();
			if (_tagString) {
				let _tags = _tagString.substring(1, _tagString.length - 1).trim();
				if (/[\[\]\{\}]/.test(_tags.replace(/\\./g, "ec"))) {
					// console.error("Unescaped meta character in tags!");
					continue;
				} else {
					passageTags = _tags.split(/\s+/);
				}
			}
			if (passageTags.length) {
				const specialTag = passageTags.includes("script") || passageTags.includes("stylesheet");

				r.push({
					line: i, startCharacter: reName.length, length: 1, tokenType: "comment", tokenModifiers: []
				}, {
					line: i, startCharacter: reName.length + 1, length: _tagString.length - 2,
					tokenType: specialTag ? "special" : "passageTags",
					tokenModifiers: []
				}, {
					line: i, startCharacter: (reName + _tagString).length - 1, length: 1, tokenType: "comment", tokenModifiers: []
				});
			}

			passageName = line.substring(reStartToken.length, reName.length).trim();
			if (!passageName) {
				// console.error("No Passage name!");
				continue;
			} else if (/[\[\]\{\}]/.test(passageName.replace(/\\./g, "ec"))) {
				// console.error("Unescaped meta character in Passage name!");
				continue;
			}

			const specialPassages = ["StoryTitle", "StoryData", "Start"];
			
			if (document.languageId === "twee3-sugarcube-2") specialPassages.push("PassageDone", "PassageFooter", "PassageHeader", "PassageReady", "Start", "StoryAuthor", "StoryBanner", "StoryCaption", "StoryDisplayTitle", "StoryInit", "StoryInterface", "StoryMenu", "StorySettings", "StoryShare", "StorySubtitle", "StoryTitle");

			const specialName = specialPassages.includes(passageName);
			
			r.push({
				line: i, startCharacter: 0, length: 2, tokenType: "startToken", tokenModifiers: []
			}, {
				line: i, startCharacter: reStartToken.length, length: passageName.length,
				tokenType: specialName ? "special" : "passageName",
				tokenModifiers: []
			});

			const root = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.path || "";
			const path = document.uri.path.replace(root, "");

			let passage = new Passage(
				passageName,
				new vscode.Range(i, 0, i + 1, 0),
				{ start: curStart, endHeader: curEnd, end: curEnd },
				{ root, path, full: document.uri.path },
				vscode.TreeItemCollapsibleState.None
			);

			let previous = newPassages.pop();
			if (previous) {
				previous.range = new vscode.Range(previous.range.start, new vscode.Position(i, 0));
				previous.stringRange.end = curStart - 1;
				newPassages.push(previous);
			}

			passage.tags = passageTags;
			passage.description = passage.tags.join(", ");

			passage.meta = passageMeta;

			let icon = "", color = "";

			if (!StoryData?.start && passageName === "Start" || passageName === StoryData?.start) {
				icon = "rocket";
				color = "charts.yellow";
			} else {
				switch (passageName) {
					case "StoryTitle": icon = "mention"; color = "charts.orange"; break;
					case "StoryData": icon = "json"; color = "charts.purple"; break;
				}
			}
			if (passage.tags.includes("script")) {
				icon = "code";
				color = "charts.blue";
			} else if (passage.tags.includes("stylesheet")) {
				icon = "paintcan";
				color = "charts.green";
			}

			passage.iconPath = icon ? new vscode.ThemeIcon(icon, color ? new vscode.ThemeColor(color) : undefined) : "";

			newPassages.push(passage);
		}
	} while (lastIndex !== -1);

	let lastPassage = newPassages.pop();
	if (lastPassage) {
		lastPassage.range = new vscode.Range(lastPassage.range.start, new vscode.Position(lineIndices.length, 0));
		lastPassage.stringRange.end = document.text.length - 1;
		newPassages.push(lastPassage);
	}

	await context.workspaceState.update("passages", passages.concat(newPassages));
	provider?.refresh();
	if (document.languageId === "twee3-sugarcube-2") sc2m.argumentCache.clearMacrosUsingPassage();

	return Promise.resolve(r);
}

export async function parseText(context: vscode.ExtensionContext, document: vscode.TextDocument, provider?: PassageListProvider): Promise<IParsedToken[]> {
	return parseRawText(context, {
		text: document.getText(),
		uri: document.uri,
		languageId: document.languageId
	}, provider);
}

const tokenTypes = new Map<string, number>();
export const legend = (function () {
	const tokenTypesLegend: string[] = [
		"startToken", "passageName", "passageTags", "passageMeta", "special", "comment"
	];
	tokenTypesLegend.forEach((tokenType, index) => tokenTypes.set(tokenType, index));
	return new vscode.SemanticTokensLegend(tokenTypesLegend);
})();

export class DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
	constructor(private context: vscode.ExtensionContext) { }

	async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
		const allTokens = await parseText(this.context, document);
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