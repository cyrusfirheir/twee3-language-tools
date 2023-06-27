import * as vscode from "vscode";

import { readFile } from "./file-ops";

export class PassageListProvider implements vscode.TreeDataProvider<Passage> {
	private _onDidChangeTreeData: vscode.EventEmitter<Passage | undefined | void> = new vscode.EventEmitter<Passage | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Passage | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext) { }

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Passage): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Passage): Thenable<Passage[]> {
		const passages: Passage[] = this.context.workspaceState.get("passages", []);

		if (!vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("list")) return Promise.resolve([]);

		switch (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("group")) {

			case "File": {
				let origins: string[] = [];
				let files: Passage[] = [];
				passages.forEach(el => {
					if (!origins.includes(el.origin.full)) {
						origins.push(el.origin.full);
						let p = new Passage(el.origin.path.split("/").pop() || "", el.range, el.stringRange, el.origin, vscode.TreeItemCollapsibleState.Expanded);
						p.tooltip = el.origin.path.substring(1);
						files.push(p);
					}
				});

				if (element) {
					return Promise.resolve(passages
						.filter(el => el.origin.full === element.origin.full)
						.sort((a, b) => a.name.localeCompare(b.name))
					);
				} else return Promise.resolve(files.sort((a, b) => a.name.localeCompare(b.name)));
			}

			case "Folder": {
				let origins: string[] = [];
				let folders: Passage[] = [];
				passages.forEach(el => {
					const _path = el.origin.path.split("/").slice(0, -1).join("/");
					const _origin = {
						root: el.origin.root,
						path: _path,
						full: el.origin.root + _path
					};
					if (!origins.includes(_origin.full)) {
						origins.push(_origin.full);
						let p = new Passage(_origin.path, el.range, el.stringRange, _origin, vscode.TreeItemCollapsibleState.Expanded);
						p.tooltip = _origin.path;
						folders.push(p);
					}
				});

				if (element) {
					return Promise.resolve(passages
						.filter(el => el.origin.path.split("/").slice(0, -1).join("/") === element.origin.path)
						.sort((a, b) => a.name.localeCompare(b.name))
					);
				} else return Promise.resolve(folders.sort((a, b) => a.name.localeCompare(b.name)));
			}

			case "Tag": {
				let tags: string[] = [];
				let groups: Passage[] = [];
				passages.forEach(el => {
					el.tags?.forEach(elem => {
						if (!tags.includes(elem)) {
							tags.push(elem);
							let p = new Passage(elem, el.range, el.stringRange, el.origin, vscode.TreeItemCollapsibleState.Expanded);
							groups.push(p);
						}
					});
				});
				let ungrouped = new Passage("", new vscode.Range(0,0,0,0), { start: 0, endHeader: 0, end: 0 }, { root: "", path: "", full: "" }, vscode.TreeItemCollapsibleState.Expanded);
				ungrouped.description = "Untagged";
				groups.sort((a, b) => a.name.localeCompare(b.name)).push(ungrouped);

				if (element) {
					if (element.name) {
						return Promise.resolve(passages
							.filter(el => el.tags?.includes(element.name))
							.sort((a, b) => a.name.localeCompare(b.name))
						);
					} else {
						return Promise.resolve(passages
							.filter(el => !el.tags?.length)
							.sort((a, b) => a.name.localeCompare(b.name))
						);
					}
				} else return Promise.resolve(groups);
			}

			case "None":
			default: {
				return Promise.resolve(passages.sort((a, b) => a.name.localeCompare(b.name)));
			}
		}
	}
}

export interface PassageOrigin {
	root: string;
	path: string;
	full: string;
}

export interface PassageStringRange {
	start: number;
	endHeader: number;
	end: number;
}

export interface PassageRange {
	startLine: number;
	startCharacter: number;
	endLine: number;
	endCharacter: number;
}

export interface OpenPassageParams {
	name: string;
	origin: PassageOrigin;
	range: PassageRange;
	stringRange: PassageStringRange;
}

export class Passage extends vscode.TreeItem {
	constructor(
		public name: string,
		public range: vscode.Range,
		public stringRange: PassageStringRange,
		public origin: PassageOrigin,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public tags?: string[],
		public meta?: any,
	) {
		super(name, collapsibleState);
	}

	async getHeader() {
		const docText = await readFile(this.origin.full);
		return docText.slice(this.stringRange.start, this.stringRange.endHeader);
	}

	async getContent(includeHeader=false) {
		const docText = await readFile(this.origin.full);
		return this.getContentFromText(docText, includeHeader)
	}

	getContentFromText(docText: string, includeHeader = false) {
		return docText.slice(includeHeader ? this.stringRange.start : this.stringRange.endHeader + 1, this.stringRange.end + 1);
	}
}

export function jumpToPassage(passage: Passage | OpenPassageParams) {
	vscode.window.showTextDocument(vscode.Uri.file(passage.origin.full)).then(editor => {
		const range = (passage.range instanceof vscode.Range) ? passage.range : new vscode.Range(
			passage.range.startLine,
			passage.range.startCharacter,
			passage.range.endLine,
			passage.range.endCharacter,
		);
		editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
	});
}

export function passageAtCursor(context: vscode.ExtensionContext, editor: vscode.TextEditor) {
	const passages = context.workspaceState.get("passages") as Passage[];
	const editorPath = editor?.document.uri.path.split("/").filter((step) => step.length > 0) as [string];
	const editorPosition = editor?.selection.active;
	return passages.find((passage) => passage.origin.full.split("/")
		.filter((step) => step.length > 0)
		.every((step, index) => step === editorPath[index])
		&& editorPosition && passage.range.start.line <= editorPosition.line && passage.range.end.line - 1 >= editorPosition.line
		/* double check to appease typeerror */
	);
}

function createPassageSymbol(passage: Passage) {
	return new vscode.SymbolInformation(
		passage.name,
		vscode.SymbolKind.Class,
		"",
		new vscode.Location(vscode.Uri.file(passage.origin.full), passage.range)
	);
}

export class PassageSymbolProvider implements vscode.DocumentSymbolProvider {
	constructor(private context: vscode.ExtensionContext) { }
	
	provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
		const symbols: vscode.SymbolInformation[] = [];
		(this.context.workspaceState.get("passages", []) as Passage[]).forEach(passage => {
			if (passage.origin.full === document.uri.path) {
				symbols.push(createPassageSymbol(passage));
			}
		});
		return symbols;
	}
}

export class WorkspacePassageSymbolProvider implements vscode.WorkspaceSymbolProvider {
	constructor(private context: vscode.ExtensionContext) { }

	provideWorkspaceSymbols(query: string, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[]> {
		const symbols: vscode.SymbolInformation[] = [];
		if (query.length) {
			const queryRegex = new RegExp(query.split("").join(".*") + ".*", "i");
			(this.context.workspaceState.get("passages", []) as Passage[]).forEach(passage => {
				if (queryRegex.test(passage.name)) {
					symbols.push(createPassageSymbol(passage));
				}
			});
		}
		return symbols;
	}
}