import * as vscode from 'vscode';
import { Passage, PassageListProvider } from './tree-view';
import * as sc2m from './sugarcube-2/macros';

interface IParsedToken {
	line: number;
	startCharacter: number;
	length: number;
	tokenType: string;
	tokenModifiers: string[];
}

export const passageHeaderRegex = /(^::\s*)(.*?)(\[.*?\]\s*)?(\{.*?\}\s*)?$/;

export const parseText = async function (context: vscode.ExtensionContext, document: vscode.TextDocument, provider?: PassageListProvider): Promise<IParsedToken[]> {
	const passages = (context.workspaceState.get("passages", []) as Passage[]).filter(el => el.origin !== document.uri.path);
	const newPassages: Passage[] = [];

	const r: IParsedToken[] = [];

	const lines = document.getText().split(/\r?\n/);
	lines.forEach((line, i) => {

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
				return;
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
					return;
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
				return;
			} else if (/[\[\]\{\}]/.test(passageName.replace(/\\./g, "ec"))) {
				// console.error("Unescaped meta character in Passage name!");
				return;
			}
			const specialName = [ "StoryTitle", "StoryData", "Start" ].includes(passageName);
			r.push({
				line: i, startCharacter: 0, length: 2, tokenType: "startToken", tokenModifiers: []
			}, {
				line: i, startCharacter: reStartToken.length, length: passageName.length,
				tokenType: specialName ? "special" : "passageName",
				tokenModifiers: []
			});

			let passage = new Passage(
				document.uri.path,
				new vscode.Range(i, 0, i + 1, 0),
				passageName,
				vscode.TreeItemCollapsibleState.None
			);

			let previous = newPassages.pop();
			if (previous) {
				previous.range = new vscode.Range(previous.range.start, new vscode.Position(i - 1, 0));
				newPassages.push(previous);
			}

			passage.tags = passageTags;
			passage.description = passage.tags.join(", ");
	
			passage.meta = passageMeta;

			let icon = "", color = "";
	
			switch (passageName) {
				case "Start": icon = "rocket"; color = "charts.yellow"; break;
				case "StoryTitle": icon = "mention"; color = "charts.orange"; break;
				case "StoryData": icon = "json"; color = "charts.purple"; break;
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
	});

	let lastPassage = newPassages.pop();
	if (lastPassage) {
		lastPassage.range = new vscode.Range(lastPassage.range.start, new vscode.Position(lines.length, 0));
		newPassages.push(lastPassage);
	}

	await context.workspaceState.update("passages", passages.concat(newPassages));
	provider?.refresh();
	if (document.languageId === "twee3-sugarcube-2") sc2m.argumentCache.clearMacrosUsingPassage();

	return Promise.resolve(r);
}