import * as vscode from 'vscode';

export class PassageListProvider implements vscode.TreeDataProvider<Passage> {
	private _onDidChangeTreeData: vscode.EventEmitter<Passage | undefined | void> = new vscode.EventEmitter<Passage | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Passage | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext) { }

	refresh(): void {
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
					if (!origins.includes(el.origin)) {
						origins.push(el.origin);
						const wF = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(el.origin))?.uri.path || "";
						let p = new Passage(el.origin, el.origin.split("/").pop() || "", vscode.TreeItemCollapsibleState.Expanded);
						p.tooltip = el.origin.replace(wF, "").substring(1);
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
					const _origin = el.origin.split("/").slice(0, -1).join("/");
					if (!origins.includes(_origin)) {
						origins.push(_origin);
						const wF = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(el.origin))?.uri.path || "";
						let p = new Passage(_origin, _origin.replace(wF, ""), vscode.TreeItemCollapsibleState.Expanded);
						p.tooltip = _origin.replace(wF, "");
						folders.push(p);
					}
				});

				if (element) {
					return Promise.resolve(passages
						.filter(el => el.origin.split("/").slice(0, -1).join("/") === element.origin)
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
							let p = new Passage(el.origin, elem, vscode.TreeItemCollapsibleState.Expanded);
							groups.push(p);
						}
					});
				});
				let ungrouped = new Passage("", "", vscode.TreeItemCollapsibleState.Expanded);
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

export class Passage extends vscode.TreeItem {
	constructor(
		public origin: string,
		public name: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public tags?: string[],
		public meta?: string,
	) {
		super(name, collapsibleState);
	}
}