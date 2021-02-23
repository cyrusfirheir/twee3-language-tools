import * as vscode from 'vscode';
import headsplit from './headsplit';
import { diagnostics as sc2 } from './sugarcube-2/macros';
import { storyDataPassageHeaderRegex, storyDataPassageNameRegex } from './twee-project';

export const updateDiagnostics = async function (ctx: vscode.ExtensionContext, document: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
	if (!/^twee3.*/.test(document.languageId)) return;

	let diagnostics: vscode.Diagnostic[] = [];
	const raw = document.getText();
	let lines = raw.split(/\r?\n/g);
	lines.forEach((line, i) => {

		if (line.startsWith("::")) {

			if (vscode.workspace.getConfiguration("twee3LanguageTools.twee-3.warning").get("spaceAfterStartToken") && !/\s/.test(line[2])) {
				diagnostics.push({
					severity: vscode.DiagnosticSeverity.Warning,
					range: new vscode.Range(i, 0, i, 3),
					message: `\nNo space between Start token (::) and passage name.\n\n(If this is a CSS selector for a pseudo element, add a universal selector (*), or at least one whitespace before the start token.)\n\n`,
					source: 'Style guide',
					code: 0
				});
			}

			if (storyDataPassageHeaderRegex.test(line)) {
				const storydata = headsplit(raw, /^::(.*)/).find(el => storyDataPassageNameRegex.test(el.header));
				if (storydata?.content) {
					try {
						JSON.parse(storydata.content);
					} catch (ex) {
						diagnostics.push({
							severity: vscode.DiagnosticSeverity.Error,
							range: new vscode.Range(i, 0, i + storydata.content.split("\n").length + 1, 0),
							message: `\nMalformed StoryData JSON!\n\n${ex}\n\n`,
							source: 'ex',
							code: 1
						});
					}
				}
			}
		}
	});

	if (document.languageId === "twee3-sugarcube-2") diagnostics = diagnostics.concat(await sc2(ctx, document));

	collection.set(document.uri, diagnostics);
};