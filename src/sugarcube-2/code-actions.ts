import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { macroRegex, macroDef, macro, collectCache } from './macros';

export class EndMacro implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix
	];

	public async provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<vscode.CodeAction[]> {
		return context.diagnostics
			.filter(el => el.code === 102)
			.map(el => {
				const macroName = document.getText(el.range).replace(macroRegex, "$2");

				const fix = new vscode.CodeAction(`Change to '<</${macroName}>>'`, vscode.CodeActionKind.QuickFix);
				fix.edit = new vscode.WorkspaceEdit();
				fix.edit.replace(document.uri, new vscode.Range(el.range.start, el.range.end), `<</${macroName}>>`);

				return fix;
			});
	}
}

export class Unrecognized implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix
	];

	public async provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<vscode.CodeAction[]> {
		const collected = await collectCache.get(document);
		let newMacros = new Map<string, macroDef>();

		context.diagnostics
			.filter(el => el.code === 100)
			.forEach(el => {
				const macroName = document.getText(el.range).replace(macroRegex, "$2");
				if (!newMacros.has(macroName)) newMacros.set(macroName, {
					name: macroName
				});
			});

		return Array.from(newMacros).map(el => this.createCommandCodeAction(el[1], collected));
	}

	private createCommandCodeAction(def: macroDef, collected: any): vscode.CodeAction {
		if (collected.macros.some((el: macro) => el.name === def.name && !el.open)) def.container = true;
		const fix = new vscode.CodeAction(`Add to definitions`, vscode.CodeActionKind.QuickFix);
		fix.command = {
			command: "twee3LanguageTools.sc2.defineMacro",
			title: "Add macro to definitions",
			tooltip: "Will add the definition to 't3lt.twee-config.yml'.",
			arguments: [
				def.name,
				def
			]
		}
		return fix;
	}
}

export const unrecognizedMacroFixCommand = async (name: string, def: macroDef) => {
	let fsPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	if (!fsPath) return;

	let macros = { [name]: def };

	let files = await vscode.workspace.findFiles("t3lt.twee-config.yml", "**/node_modules/**");
	if (files.length) {
		let doc = await vscode.workspace.openTextDocument(files[0]);
		try {
			let yml = yaml.parse(doc.getText());
			yml["sugarcube-2"].macros = Object.assign(yml["sugarcube-2"].macros, macros);
			let ymlString = yaml.stringify(yml);
			await vscode.workspace.fs.writeFile(files[0], Buffer.from(ymlString, "utf-8"));
		} catch (ex) {
			vscode.window.showErrorMessage(`\nCouldn't parse '${files[0]}'!\n\n${ex}\n\n`);
		}
	} else {
		let ymlString = yaml.stringify({
			"sugarcube-2": {
				macros
			}
		});
		await vscode.workspace.fs.writeFile(vscode.Uri.file(fsPath + "/t3lt.twee-config.yml"), Buffer.from(ymlString, "utf-8"));
	}

	vscode.commands.executeCommand("twee3LanguageTools.refreshDiagnostics");
};