import * as vscode from 'vscode';

export interface macro {
	id: number;
	pair: number;
	name: string;
	open: boolean;
	range: vscode.Range;
}
export const decor = vscode.window.createTextEditorDecorationType({
	backgroundColor: new vscode.ThemeColor("editor.wordHighlightBackground"),
	borderRadius: "0.25rem",
	textDecoration: "underline"
});

export const macroRegex = /<<(\/)?([A-Za-z][\w-]*|[=-])/g;

export const collect = function (raw: string) {
	
	let macros: macro[] = [];
	let id = 0;
	let opened: any = {};

	let lines = raw.split(/\r?\n/);
	lines.forEach((line, i) => {
		let re = macroRegex;
		let ex;
		while((ex = re.exec(line)) !== null) {
			macros.push({
				id: id,
				pair: id,
				name: ex[2],
				open: ex[1] ? false : true,
				range: new vscode.Range(i, ex.index, i, ex.index + ex[0].length)
			});
			id++;
		}
	});

	macros.forEach((el) => {
		opened[el.name] = opened[el.name] || [];
		if (el.open) opened[el.name].push(el.id);
		else {
			if (opened[el.name].length) {
				let pair: number = opened[el.name].pop();
				el.pair = pair;
				macros[pair].pair = el.id;
			}
		}
	});

	return macros;
};