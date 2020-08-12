import * as vscode from 'vscode';
import headsplit from './headsplit';

export const updateDiagnostics = function (document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {

	if (!document.languageId.match(/twee3.*/)) {
		collection.clear();
		return;
	}

	let diagnostics: vscode.Diagnostic[] = [];
	const raw = document.getText();
    let lines = raw.split(/\r?\n/g);
    lines.forEach((line, i) => {
		
		if (line.startsWith("::")) {

			if (!line[2].match(/\s/)) {
				diagnostics.push({
					severity: vscode.DiagnosticSeverity.Warning,
					range: new vscode.Range(
						new vscode.Position(i, 0),
						new vscode.Position(i, 3)
					),
					message: `\nNo space between Start token (::) and passage name.\n\n(If this is a CSS selector for a pseudo element, add a universal selector (*), or at least one whitespace before the start token.)\n\n`,
					source: 'Style guide',
					code: 0
				});
			}

			if (line.match(/^::\s*StoryData\b/gm)) {
				const storydata = headsplit(raw, /^::(.*)/).find(el => el.header === "StoryData");
				if (storydata?.content) {
					try {
						JSON.parse(storydata.content);
					} catch (ex) {
						diagnostics.push({
							severity: vscode.DiagnosticSeverity.Error,
							range: new vscode.Range(
								new vscode.Position(i, 0),
								new vscode.Position(i + storydata.content.split("\n").length + 1, 0)
							),
							message: `\nMalformed StoryData JSON!\n\n${ex}\n\n`,
							source: 'ex',
							code: 1
						});
					}
				}
			}
		}
	});

	collection.set(document.uri, diagnostics);
}