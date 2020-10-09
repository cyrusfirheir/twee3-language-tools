import * as vscode from 'vscode';
import { Passage, PassageListProvider } from './tree-view';

interface IParsedToken {
	line: number;
	startCharacter: number;
	length: number;
	tokenType: string;
	tokenModifiers: string[];
}

export const parseText = async function (context: vscode.ExtensionContext, document: vscode.TextDocument, provider?: PassageListProvider): Promise<IParsedToken[]> {
	let passages: Passage[] = [];
	let list = false;
	if (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) {
		list = true;
		const old: Passage[] = context.workspaceState.get("passages", []);
		passages = old.filter(el => el.origin !== document.uri.path);
	}
	const r: IParsedToken[] = [];
	const lines = document.getText().split(/\r?\n/);
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
				/[}\]]/g.test(escaped.substring(2, 2 + nameLength)) ||
				escaped.split("[").length - 1 > 1 ||
				escaped.split("{").length - 1 > 1 ||
				oTag > 0 && !tag ||
				oMeta > 0 && !meta ||
				oMeta > 0 && oMeta < oTag
			)) {
				let passageName, specialName, passageTags, specialTag, passageMeta;

				passageName = line.substring(2, 2 + nameLength).trim();
				specialName = [
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
					passageTags = line.substring(oTag + 1, cTag).trim();
					specialTag = [
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
					passageMeta = line.substring(oMeta, cMeta + 1);
					r.push({
						line: i, startCharacter: oMeta, length: 1, tokenType: "comment", tokenModifiers: []
					}, {
						line: i, startCharacter: oMeta + 1, length: cMeta - oMeta - 1, tokenType: "passageMeta", tokenModifiers: []
					}, {
						line: i, startCharacter: cMeta, length: 1, tokenType: "comment", tokenModifiers: []
					});
				}

				if (list) {
					let passage = new Passage(document.uri.path, passageName, vscode.TreeItemCollapsibleState.None);

					passage.tags = passageTags?.split(/\s/);
					passage.description = passage.tags?.join(", ") || "";

					passage.meta = passageMeta || "";

					let icon = "";

					if (specialName) switch (passageName) {
						case "Start": icon = "rocket"; break;
						case "StoryTitle": icon = "mention"; break;
						case "StoryData": icon = "json"; break;
					}
					else if (specialTag) switch (passage.tags?.[0]) {
						case "script": icon = "code"; break;
						case "stylesheet": icon = "paintcan"; break;
					}

					passage.iconPath = icon ? new vscode.ThemeIcon(icon) : "";

					passages.push(passage);
				}
			}
		}
	});

	if (list) await context.workspaceState.update("passages", passages);
	provider?.refresh();

	return Promise.resolve(r);
}