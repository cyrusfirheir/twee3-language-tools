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
        return Promise.resolve(Array.from(passages).sort((a, b) => a.name.localeCompare(b.name)));
    }
}

export class Passage extends vscode.TreeItem {
    constructor(
        public __origin__: string,
        public name: string,
        public tags?: string[],
        public meta?: string
    ) {
        super(name);
    }
}