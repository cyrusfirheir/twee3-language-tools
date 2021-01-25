import * as vscode from 'vscode';

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
						let p = new Passage(el.origin, el.range, el.origin.path.split("/").pop() || "", vscode.TreeItemCollapsibleState.Expanded);
						p.tooltip = el.origin.path.substring(1);
						files.push(p);
					}
				});

				if (element) {
					return Promise.resolve(passages
						.filter(el => el.origin === element.origin)
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
						let p = new Passage(_origin, el.range, _origin.path, vscode.TreeItemCollapsibleState.Expanded);
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
							let p = new Passage(el.origin, el.range, elem, vscode.TreeItemCollapsibleState.Expanded);
							groups.push(p);
						}
					});
				});
				let ungrouped = new Passage({ root: "", path: "", full: "" }, new vscode.Range(0,0,0,0), "", vscode.TreeItemCollapsibleState.Expanded);
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

export interface OpenPassageParams {
	name: string;
	origin: {
		root: string;
		path: string;
		full: string;
	};
	range: {
		startLine: number;
		startCharacter: number;
		endLine: number;
		endCharacter: number;
	};
}

export class Passage extends vscode.TreeItem {
	constructor(
		public origin: {
			root: string;
			path: string;
			full: string;
		},
		public range: vscode.Range,
		public name: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public tags?: string[],
		public meta?: any,
	) {
		super(name, collapsibleState);
	}

	async getContent() {
		const doc = await vscode.workspace.openTextDocument(this.origin.root + this.origin.path);
		return doc.getText(new vscode.Range(this.range.start.translate(1), this.range.end));
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