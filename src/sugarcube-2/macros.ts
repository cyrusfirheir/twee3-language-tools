import * as vscode from 'vscode';
import * as yaml from 'yaml';
import * as macroListCore from './macros.json';

export interface macro {
	id: number;
	pair: number;
	name: string;
	open: boolean;
	selfClosed: boolean;
	endVariant: boolean;
	range: vscode.Range;
}

export interface macroDef {
	name?: string;
	description?: string,
	container?: boolean;
	selfClose?: boolean;
	children?: string[];
	parents?: string[];
	deprecated?: boolean;
	deprecatedSuggestions?: string[];
}

export const decor = vscode.window.createTextEditorDecorationType({
	backgroundColor: new vscode.ThemeColor("editorBracketMatch.background"),
	borderRadius: "0.25rem",
	textDecoration: "underline",
	fontWeight: "bold",
	overviewRulerLane: vscode.OverviewRulerLane.Center,
	overviewRulerColor: new vscode.ThemeColor("minimap.findMatchHighlight"),
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

export const macroRegex = /<<(\/|end)?([A-Za-z][\w-]*|[=-])(?:\s*)((?:(?:`(?:\\.|[^`\\])*`)|(?:"(?:\\.|[^"\\])*")|(?:'(?:\\.|[^'\\])*')|(?:\[(?:[<>]?[Ii][Mm][Gg])?\[[^\r\n]*?\]\]+)|[^>]|(?:>(?!>)))*?)(\/)?>>/gm;

export const macroList = async function () {
	let list: any = Object.assign(Object.create(null), macroListCore);

	let customList: any = {};

	for (let v of await vscode.workspace.findFiles("**/*.twee-config.{json,yaml,yml}", "**/node_modules/**")) {
		let file = await vscode.workspace.openTextDocument(v);
		try {
			customList = yaml.parse(file.getText())["sugarcube-2"]?.macros || {};
		} catch (ex) {
			vscode.window.showErrorMessage(`\nCouldn't parse ${file.fileName}!\n\n${ex}\n\n`);
		}
		list = Object.assign(list, customList);
	}

	return list;
};

export const collect = async function (raw: string) {
	const list = await macroList();
	const cleanList = [
		["/\\*", "\\*/"],
		["/%", "%/"],
		["<!--", "-->"],
		["{{3}", "}{3}"],
		["\"{3}", "\"{3}"],
		["<nowiki>", "</nowiki>"],
		["<script>", "</script>"],
		["<style>", "</style>"],
		["^::.*?\\[\\s*script\\s*\\]", "^(?=::)"],
		["^::.*?\\[\\s*stylesheet\\s*\\]", "^(?=::)"]
	];

	let macros: macro[] = [];
	let id = 0;
	let opened: any = {};

	let lines = raw.split(/\n/); // used only for keeping count

	let cleaned = raw + "\n::";

	cleanList.forEach(el => {
		let searchString = `(${el[0]})((?:.|\r?\n)*?)(${el[1]})`;
		cleaned = cleaned.replace(new RegExp(searchString, "gmi"), function (match, p1, p2, p3) {
			return p1 + p2.replace(/<</g, "MO") + p3;
		});
	});

	let re = macroRegex;
	let ex;
	while ((ex = re.exec(cleaned)) !== null) {
		let open = true,
			endVariant = false,
			pair = id,
			name = ex[2],
			selfClosed = false;

		let selfCloseMacro = undefined;

		if (ex[1] === "end") {
			if (list[ex[2]]) {
				endVariant = true;
				open = false;
			} else {
				name = ex[1] + ex[2];
			}
		}

		if (ex[1] === "/" || endVariant) open = false;

		let lineStart = cleaned.substring(0, ex.index).split(/\n/).length - 1;
		let lineEnd = lineStart + ex[0].split(/\n/).length - 1;
		let charStart = ex.index - lines.slice(0, lineStart).join("\n").length - 1;
		let charEnd = charStart + ex[0].length;

		let range = new vscode.Range(lineStart, charStart, lineEnd, charEnd);

		if (ex[4] === "/" && vscode.workspace.getConfiguration("twee3LanguageTools.experimental.sugarcube-2.selfClosingMacros").get("enable")) {
			selfClosed = true;
			selfCloseMacro = {
				id: id + 1, pair: pair++,
				name, open: false,
				range: new vscode.Range(lineEnd, charEnd, lineEnd, charEnd),
				endVariant, selfClosed
			};
		} else {
			opened[name] = opened[name] || [];
			if (open) opened[name].push(id);
			else {
				if (opened[name].length) {
					pair = opened[name].pop();
					macros[pair].pair = id;
				}
			}
		}

		macros.push({ id, pair, name, open, range, endVariant, selfClosed });

		if (selfCloseMacro) {
			macros.push(selfCloseMacro);
			id++;
		}

		id++;
	}

	return { list, macros };
};

export const diagnostics = async function (raw: string) {
	let d: vscode.Diagnostic[] = [];

	let collected = await collect(raw);

	collected.macros.forEach(el => {
		let cur: macroDef;
		if (el.name.startsWith("end") && collected.list[el.name.substring(3)]) {
			cur = collected.list[el.name.substring(3)];
			el.open = false;
		} else {
			cur = collected.list[el.name];
		}

		if (cur) {
			if (cur.container) {
				if (el.id === el.pair) {
					d.push({
						severity: vscode.DiagnosticSeverity.Error,
						range: el.range,
						message: `\nMalformed container macro! ${el.open ? "Closing" : "Opening"} '${el.name}' tag not found!\n\n`,
						source: 'sc2-ex',
						code: 101
					});
				}
				if (
					vscode.workspace.getConfiguration("twee3LanguageTools.experimental.sugarcube-2.selfClosingMacros").get("enable") &&
					vscode.workspace.getConfiguration("twee3LanguageTools.experimental.sugarcube-2.selfClosingMacros.warning").get("irrationalSelfClose") &&
					!cur.selfClose && el.selfClosed
				) {
					d.push({
						severity: vscode.DiagnosticSeverity.Warning,
						range: el.range,
						message:
							`\nIrrational self-close! Self-closing <<${el.name}>> is not recommended.\n\n`,
						source: 'sc2-ex',
						code: 106
					});
				}
			} else {
				if (!el.open) {
					d.push({
						severity: vscode.DiagnosticSeverity.Error,
						range: el.range,
						message: `\nIllegal closing tag! '${el.name}' is not a container macro!\n\n`,
						source: 'sc2-ex',
						code: 104
					});
				}
				if (vscode.workspace.getConfiguration("twee3LanguageTools.experimental.sugarcube-2.selfClosingMacros").get("enable") && el.selfClosed) {
					d.push({
						severity: vscode.DiagnosticSeverity.Error,
						range: el.range,
						message: `\nIllegal self-close! '${el.name}' is not a container macro!\n\n`,
						source: 'sc2-ex',
						code: 105
					});
				}
			}

			if (el.endVariant && vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.warning").get("endMacro")) {
				d.push({
					severity: vscode.DiagnosticSeverity.Warning,
					range: el.range,
					message: `\n'<<end...>>' closing macros are deprecated! Use '<</${el.name}>>' instead.\n\n`,
					source: 'sc2-ex',
					code: 102
				});
			}

			if (cur.deprecated && vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.warning").get("deprecatedMacro")) {
				let suggestions = cur.deprecatedSuggestions?.reduce((a, c) => {
					return a + `- ${c}\n`
				}, "");
				d.push({
					severity: vscode.DiagnosticSeverity.Warning,
					range: el.range,
					message:
						`\nDeprecated macro!\n\n` +
						(suggestions ? `Instead use:\n${suggestions}\n` : ""),
					source: 'sc2-ex',
					code: 103
				});
			}

		} else if (vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.warning").get("undefinedMacro")) {
			d.push({
				severity: vscode.DiagnosticSeverity.Warning,
				range: el.range,
				message: `\nUnrecognized macro! '${el.name}' has not been defined in config files!\n\n`,
				source: 'sc2-ex',
				code: 100
			});
		}
	});

	return d;
};

/**
 * Provides hover information for macros.
 */
export const hover = async function (document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | null> {
	// Acquire list of macros in the file.
	const collected = await collect(document.getText());

	const angle_start_length = '<<'.length;
	const angle_end_length = '>>'.length;

	// Find the macro with which our position intersects with
	for (let i = 0; i < collected.macros.length; i++) {
		const macro = collected.macros[i];
		const macroDefinition = collected.list[macro.name];
		// Check if the macro exists in the definitions.
		// If it doesn't then we know it can't have a description.
		if (!macroDefinition) continue;

		// Whether the position intersects with hoverable parts of the macro.
		let contained_in = false;
		if (!macroDefinition.container || macro.open) {
			// If it is not a container (and thus we are in the opening) or if it is the opening
			// Ex: in `<<linkreplace "Testing">>Text<</linkreplace>>` we want to match
			// `<<linkreplace` and the first `>>`
			const start_range = new vscode.Range(macro.range.start, macro.range.start.translate(0, macro.name.length));
			const end_range = new vscode.Range(macro.range.end.translate(0, -angle_end_length), macro.range.end);
			contained_in = start_range.contains(position) || end_range.contains(position);
		} else if (macroDefinition.container && !macro.open) {
			// We are a container, and we are on the closing end.
			// This means that we simply want to match all of it.
			// Ex: in `<<linkreplace "Testing>>Text<</linkreplace>>"` we want to match
			// `<</linkreplace>>` and since there is no arguments on the closing, we can just
			// check the given range.
			contained_in = macro.range.contains(position);
		}

		// If the position is on a hoverable part of the macro
		// And if the macro exists
		// We have to use the ugly prototype.hasOwnProperty because the macroList is constructed
		// with a null prototype.
		if (contained_in && Object.prototype.hasOwnProperty.call(collected.list, macro.name)) {
			let macroDefinition = collected.list[macro.name];
			if (typeof (macroDefinition.description) === "string") {
				return new vscode.Hover(macroDefinition.description);
			} else {
				// We found the macro the user is hovering over, but there is no description.
				// Thus, there is no need to continue looking for it.
				return null;
			}
		}
	}

	// There was no macro intersecting, thus we have no hover result.
	return null;
}