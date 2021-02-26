import * as vscode from "vscode";

import * as glob from "glob";
import minimatch from "minimatch";

import { Passage, PassageOrigin, PassageRange, PassageStringRange } from "./passage";
import { parseRawText } from "./parse-text";

export function removeLeadingSlash(path: string) {
	return path.startsWith("/") ? path.substring(1) : path;
}

export async function readFile(path: string) {
	return Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(path))).toString("utf-8");
}

export function writeFile(path: string, content: string) {
	return vscode.workspace.fs.writeFile(vscode.Uri.file(path), Buffer.from(content, "utf-8"));
}

export interface MoveData {
	toFile: string;
	toFileContent?: string;
	passages: Array<{
		name: string;
		range: PassageRange
		stringRange: PassageStringRange;
		origin: PassageOrigin;
		content?: string;
	}>;
}

export async function moveToFile(context: vscode.ExtensionContext, moveData: MoveData) {
	// Make thepassages appear in the order they were
	const sortedPassages = moveData.passages.slice().sort((a, b) => {
		const fileCompare = a.origin.full.localeCompare(b.origin.full);
		if (fileCompare !== 0) return fileCompare;
		if (a.range.startLine > b.range.startLine) return 1;
		if (a.range.startLine < b.range.startLine) return -1;
		return 0;
	});

	// Update files
	let text: string[] = new Array(sortedPassages.length);
	
	const files = [... new Set(moveData.passages.map(passage => passage.origin.full))];
	for (const file of files) {
		const fDocText = await readFile(file);
		let edited = fDocText;

		const filePassages = moveData.passages.filter(el => el.origin.full === file);

		for (const passage of filePassages) {
			const p = new Passage(passage.name, new vscode.Range(
				passage.range.startLine, passage.range.startCharacter, passage.range.endLine, passage.range.endCharacter
			), { 
				start: passage.stringRange.start, endHeader: passage.stringRange.endHeader, end: passage.stringRange.end
			}, passage.origin, vscode.TreeItemCollapsibleState.None);
			const content = await p.getContent(true);

			text[sortedPassages.indexOf(passage)] = content;
			passage.content = content;

			edited = edited.replace(content, "");
		}

		await writeFile(file, edited);
		await parseRawText(context, {
			text: edited,
			uri: vscode.Uri.file(file),
			languageId: "twee3"
		});
	}

	let docText: string | undefined = undefined;

	try {
		docText = await readFile(moveData.toFile);
		if (docText?.trim()) text.unshift(docText + "\n\n");
	} catch (ex) {
		console.log(`"${moveData.toFile}" does not exist! Creating...`);
	}

	moveData.toFileContent = text.join("");
	await writeFile(moveData.toFile, moveData.toFileContent);
	await parseRawText(context, {
		text: moveData.toFileContent,
		uri: vscode.Uri.file(moveData.toFile),
		languageId: "twee3"
	});
}

const includeDirs = (): string[] => vscode.workspace.getConfiguration("twee3LanguageTools.directories").get("include", []);
const excludeDirs = (): string[] => vscode.workspace.getConfiguration("twee3LanguageTools.directories").get("exclude", []);

export function fileGlob() {
	const include = includeDirs();
	const exclude = excludeDirs();
	if (!include.length) include.push("**");
	let files: string[] = [];
	vscode.workspace.workspaceFolders?.forEach(el => {
		include.forEach(elem => {
			files = [...files, ...glob.sync(el.uri.fsPath + "/" + elem + "/**/*.{tw,twee}", { ignore: exclude })];
		});
	});
	return files;
}

export interface TweeWorkspaceFile {
	name: string;
	parent: TweeWorkspaceFolder | null;
}

export interface TweeWorkspaceFolderContent {
	folders: TweeWorkspaceFolder[];
	files: TweeWorkspaceFile[];
}

export interface TweeWorkspaceFolder {
	name: string;
	parent: TweeWorkspaceFolder | null;
	absolutePath: string;
	relativePath: string;
	content: TweeWorkspaceFolderContent;
}

export async function getWorkspace() {
	const structure: TweeWorkspaceFolder[] = [];

	const exclude = excludeDirs();

	async function getFolderTree(root: vscode.Uri, folder: vscode.Uri) {
		const tree: TweeWorkspaceFolder = {
			name: folder.path.split("/").filter((str) => str).pop() ?? "",
			parent: null,
			absolutePath: folder.path,
			relativePath: folder.path.replace(root.path, ""),
			content: {
				files: [],
				folders: []
			}
		};
		const dir = await vscode.workspace.fs.readDirectory(folder);
		for (const [name, type] of dir) {
			if (type === vscode.FileType.Directory) {
				const path = folder.path + "/" + name;

				if (exclude.some(el => minimatch(path + "/", el))) continue;

				tree.content.folders.push(await getFolderTree(root, vscode.Uri.file(path)));
			} else if (type === vscode.FileType.File && /\.tw(?:ee)?$/.test(name)) {
				tree.content.files.push({ name, parent: null });
			}
		}
		return tree;
	}

	const wsFolders = vscode.workspace.workspaceFolders;
	if (wsFolders) {
		for (const folder of wsFolders) {
			const ws = await getFolderTree(folder.uri, folder.uri);
			ws.name = folder.name;
			ws.relativePath = folder.uri.path;
			structure.push(ws);
		}
	}

	return structure;
}