import * as vscode from "vscode";
import { Passage, PassageOrigin } from "./tree-view";

interface MoveData {
	toFile: string;
	passages: Array<{
		name: string;
		range: {
			lineStart: number;
			charStart: number;
			lineEnd: number;
			charEnd: number;
		};
		origin: PassageOrigin;
	}>;
}

export const testMove: MoveData = {
	toFile: "f:/projects/twee3-language-tools/tests/new.tw",
	passages: [
		{
			name: "Passage Name",
			range: {
				lineStart: 17,
				charStart: 0,
				lineEnd: 18,
				charEnd: 0
			},
			origin: {
				full: "f:/projects/twee3-language-tools/tests/Twee.tw",
				path: "/Twee.tw",
				root: "f:/projects/twee3-language-tools/tests"
			}
		},
		{
			name: "Script passage",
			range: {
				lineStart: 36,
				charStart: 0,
				lineEnd: 39,
				charEnd: 0
			},
			origin: {
				full: "f:/projects/twee3-language-tools/tests/Twee.tw",
				path: "/Twee.tw",
				root: "f:/projects/twee3-language-tools/tests"
			}
		},
	]
};

export async function moveToFile(moveData: MoveData) {
	let doc: vscode.TextDocument | undefined = undefined;
	const text: string[] = [];

	try {
		doc = await vscode.workspace.openTextDocument(vscode.Uri.file(moveData.toFile));
		text.push(doc.getText());
	} catch (ex) {
		console.warn(`"${moveData.toFile}" does not exist! Creating...`)
	}

	const files = [... new Set(moveData.passages.map(passage => passage.origin.full))];
	for (const file of files) {
		const fDoc = await vscode.workspace.openTextDocument(file);
		await fDoc.save();
		let edited = fDoc.getText();

		const filePassages = moveData.passages.filter(el => el.origin.full === file);
		for (const passage of filePassages) {
			const p = new Passage(passage.origin, new vscode.Range(
				passage.range.lineStart, passage.range.charStart, passage.range.lineEnd, passage.range.charEnd
			), passage.name, vscode.TreeItemCollapsibleState.None);
			const content = await p.getContent(true);

			text.push(content);
		
			edited = edited.replace(content, "");
		}

		await vscode.workspace.fs.writeFile(vscode.Uri.file(file), Buffer.from(edited, "utf-8"));
	}

	return vscode.workspace.fs.writeFile(vscode.Uri.file(moveData.toFile), Buffer.from(text.join("\n\n"), "utf-8"));
}