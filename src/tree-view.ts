import { unwatchFile } from 'fs';
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

		switch (vscode.workspace.getConfiguration("twee3LanguageTools.passage").get("group")) {

			case "File": {
				let origins: string[] = [];
				let files: Passage[] = [];
				passages.forEach(el => {
					if (!origins.includes(el.__origin__)) {
						origins.push(el.__origin__);
						let wF = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(el.__origin__))?.uri.path || "";
						let p = new Passage(el.__origin__,  el.__origin__.split("/").pop() || "", vscode.TreeItemCollapsibleState.Expanded);
						p.tooltip =  el.__origin__.replace(wF, "").substring(1);
						files.push(p);
					}
				});

				if (element) {
					return Promise.resolve(passages.filter(el => el.__origin__ === element.__origin__).sort((a, b) => a.name.localeCompare(b.name)));
				} else return Promise.resolve(files.sort((a, b) => a.name.localeCompare(b.name)));
			}

			case "Tag": {
				let tags: string[] = [];
				let groups: Passage[] = [];
				passages.forEach(el => {
					el.tags?.forEach(elem => {
						if (!tags.includes(elem)) {
							tags.push(elem);
							let p = new Passage(el.__origin__,  elem, vscode.TreeItemCollapsibleState.Expanded);
							groups.push(p);
						}
					});
				});
				let ungrouped = new Passage("", "", vscode.TreeItemCollapsibleState.Expanded);
				ungrouped.description = "Untagged";
				groups.sort((a, b) => a.name.localeCompare(b.name)).push(ungrouped);

				if (element) {
					if (element.name) {
						return Promise.resolve(passages.filter(el => el.tags?.includes(element.name)).sort((a, b) => a.name.localeCompare(b.name)));
					} else {
						return Promise.resolve(passages.filter(el => !el.tags?.length).sort((a, b) => a.name.localeCompare(b.name)));
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
		public __origin__: string,
		public name: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public tags?: string[],
		public meta?: string,
	) {
		super(name, collapsibleState);
	}
}