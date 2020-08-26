import * as vscode from 'vscode';

export interface macro {
	name: string;
	range: vscode.Range;
}

export const diagnostics = function (document: vscode.TextDocument): vscode.Diagnostic[] {
	const macroRegex = /<<(\/)?([A-Za-z][\w-]*|[=-])/g;

	let open: macro[] = [];
	let closed: macro[] = [];

	let diagnostics: vscode.Diagnostic[] = [];
	const raw = document.getText();
	let lines = raw
		// .replace(/<!\-\-[\S\s]*?\-\->/g, (match) => match.replace(/<</g, "SC")) //replace <!-- comments -->
		// .replace(/\/\*[\S\s]*?\*\//g, (match) => match.replace(/<</g, "SC")) //replace /* comments */
		.split(/\r?\n/g);

	lines.forEach((line, i) => {

		line.replace(macroRegex, (match, p1, p2) => {
			const pos = line.indexOf(match);
			const matched = new vscode.Range(i, pos, i, pos + match.length);

			if (!p1) open.push({ name: p2, range: matched });
			else {
				let opened = open.findIndex(el => el.name === p2);
				if (opened > 0) open.splice(opened, 1);
				else closed.push({ name: p2, range: matched });
			}

			return "O".repeat(match.length);
		});

	});

	return diagnostics;
};