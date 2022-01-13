import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { readFile, writeFile } from '../file-ops';
import { macroRegex, macroDef, macro, collectCache, macroList, MacroName } from './macros';

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
				const execArr = macroRegex.exec(document.getText(el.range));
				if (execArr) {
					const macroName = (execArr[1] === "end" ? "end" : "") + execArr[2];

					if (!newMacros.has(macroName)) newMacros.set(macroName, {
						name: macroName
					});
				}
				
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
	const macros = { [name]: def };

	return await addMacrosToFile(macros);
};

export const addMacrosToFile = async (macros: Record<string, macroDef>) => {
	const fsPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	if (!fsPath) return;

	const files = await vscode.workspace.findFiles("t3lt.twee-config.yml", "**/node_modules/**");
	if (files.length) {
		try {
			const yml = yaml.parse(await readFile(files[0].fsPath));
			yml["sugarcube-2"].macros = Object.assign(yml["sugarcube-2"].macros, macros);
			const ymlString = yaml.stringify(yml);
			await writeFile(files[0].path, ymlString);
		} catch (ex) {
			vscode.window.showErrorMessage(`\nCouldn't parse '${files[0]}'!\n\n${ex}\n\n`);
		}
	} else {
		const ymlString = yaml.stringify({
			"sugarcube-2": {
				macros
			}
		});
		await writeFile(fsPath + "/t3lt.twee-config.yml", ymlString);
	}
};

export const addAllUnrecognizedMacrosInCurrentFile = async (document: vscode.TextDocument) => {
	if (document.languageId !== "twee3-sugarcube-2") {
		return;
	}

	let macroDefinitions = await macroList();
	let uniqueMacros: Record<string, macroDef> = {};

	let collected = await collectCache.get(document);
	for (let j = 0; j < collected.macros.length; j++) {
		let name: MacroName = collected.macros[j].name;
		let def: macroDef = {
			name,
		};

		if (name in macroDefinitions || name in uniqueMacros) {
			continue;
		}

		if (collected.macros.some(el => el.name == def.name && !el.open)) {
			def.container = true;
		}

		uniqueMacros[name] = def;
	}

	await addMacrosToFile(uniqueMacros);
}

// Currently this function has the slight 'issue' that it will take the first definition it thinks 
// of when finding a macro. This means that if the first usage is a container macro and the later
// usages aren't, it will think it is a container macro.
export const addAllUnrecognizedMacros = () => {
	// TODO: It would be good to make so that you can't start two of these.

	let storyFormat = vscode.workspace.getConfiguration("twee3LanguageTools.storyformat").get("current");
	if (storyFormat !== "sugarcube-2") {
		// We can't just check each document, because vscode just assigns a lot of them 'twee'
		return;
	}

	vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		cancellable: true,
		title: 'Adding all unrecognized macros'
	}, async (progress, token) => {
		// Show that we're starting to process
		progress.report({
			message: "Beginning processing..",
		});

		const macroDefinitions = await macroList();
		let allDiags = vscode.languages.getDiagnostics();
		let uniqueMacros: Record<string, macroDef> = Object.create(null);
	
		if (token.isCancellationRequested) {
			return;
		}

		// TODO: Can we do better than iterating over all files with diagnostics?
		for (let i = 0; i < allDiags.length; i++) {
			// The cancellation's break so that the macros can still be added
			if (token.isCancellationRequested) {
				break;
			}
			
			const path: vscode.Uri = allDiags[i][0];
			progress.report({
				message: "Opening: " + path.toString(),
			});
			const document: vscode.TextDocument = await vscode.workspace.openTextDocument(path);

			progress.report({
				message: "Processing: " + path.toString(),
			});

			const collected = await collectCache.get(document);

			if (token.isCancellationRequested) {
				break;
			}

			for (let j = 0; j < collected.macros.length; j++) {
				let name: MacroName = collected.macros[j].name;
				let def: macroDef = {
					name,
				};

				if (name in uniqueMacros || name in macroDefinitions) {
					continue;
				}

				// TODO: This could be made more efficient by just updating the uniqueMacro entry
				// when we run across another instance of it.
				if (collected.macros.some(el => el.name == def.name && !el.open)) {
					def.container = true;
				}

				uniqueMacros[name] = def;
			}
		}

		progress.report({
			message: "Adding macros to definitions..",
		});

		await addMacrosToFile(uniqueMacros);
	});
}