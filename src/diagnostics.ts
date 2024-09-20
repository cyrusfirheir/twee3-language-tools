import * as vscode from 'vscode';
import { diagnostics as sc2 } from './sugarcube-2/macros';
import { LanguageID as SC2LanguageID } from './sugarcube-2/configuration';
import { Passage } from './passage';

export const updateDiagnostics = async function (ctx: vscode.ExtensionContext, document: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
	if (!/^twee3.*/.test(document.languageId)) return;

	const passages: Passage[] = (ctx.workspaceState.get("passages", []) as Passage[]).filter(passage => passage.origin.full === document.uri.path);

	const diagnostics = (await Promise.all(
		passages.map(async (passage) => {
			const [ header, content ] = await Promise.all([ passage.getHeader(document), passage.getContent(document) ]);
			const diags: vscode.Diagnostic[] = [];
			if (vscode.workspace.getConfiguration("twee3LanguageTools.twee-3.warning").get("spaceAfterStartToken") && !/\s/.test(header[2])) {
				diags.push({
					severity: vscode.DiagnosticSeverity.Warning,
					range: new vscode.Range(passage.range.start.line, 0, passage.range.start.line, 3),
					message: `\nNo space between Start token (::) and passage name.\n\n(If this is a CSS selector for a pseudo element, add a universal selector (*), or at least one whitespace before the start token.)\n\n`,
					source: 'Style guide',
					code: 0
				});
			}
			if (passage.name === "StoryData") {
				try {
					JSON.parse(content);
				} catch (ex) {
					diags.push({
						severity: vscode.DiagnosticSeverity.Error,
						range: new vscode.Range(passage.range.start.line, 0, passage.range.end.line, 0),
						message: `\nMalformed StoryData JSON!\n\n${ex}\n\n`,
						source: 'ex',
						code: 1
					});
				}
			}
			return diags;
		}).concat(
			document.languageId === SC2LanguageID ? sc2(ctx, document) : []
		)
	)).flat(2);

	collection.set(document.uri, diagnostics);
};