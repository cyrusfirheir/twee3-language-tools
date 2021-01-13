import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { Arg, parseArguments, ParsedArguments } from './arguments';
import { ArgumentError, ArgumentWarning, Parameters, parseMacroParameters } from './parameters';
import * as macroListCore from './macros.json';

export type MacroName = string;
export interface macro {
	id: number;
	pair: number;
	name: MacroName;
	open: boolean;
	selfClosed: boolean;
	endVariant: boolean;
	range: vscode.Range;
}

export interface macroDef {
	name?: MacroName;
	description?: string,
	parameters?: Parameters,
	container?: boolean;
	selfClose?: boolean;
	children?: string[];
	parents?: string[];
	deprecated?: boolean;
	deprecatedSuggestions?: string[];
	skipArgs?: boolean,
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

const macroFileWatcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher(
	"**/*.twee-config.{json,yaml,yml}",
	false,
	false,
	false,
);
macroFileWatcher.onDidChange(async (e) => {
	await updateMacroCache();
});
macroFileWatcher.onDidCreate(async (e) => {
	await updateMacroCache();
});
macroFileWatcher.onDidDelete(async (e) => {
	await updateMacroCache();
});

/**
 * Cache of macro definitions.
 * Updated whenever the files change.
 */
let macroCache: Record<string, macroDef> | null = null;
export const macroList = async function (): Promise<Record<string, macroDef>> {
	if (macroCache === null) {
		await updateMacroCache();
	}

	// After updating macro list, it should not be null.
	return macroCache as Record<string, macroDef>;
}

/**
 * Update the cache with by parsing the files.
 */
const updateMacroCache = async function () {
	let list = await parseMacroList();
	// Before we cache it, we parse the parameters into a more useful format.
	let errors = parseMacroParameters(list);
	// We can continue despite errors from parsing the parameters, but we report them.
	if (errors.length > 0) {
		// Note: Since this is called early on, these messages might not be displayed.
		let errorMessages: string = errors.map(err => err.message).join(", \n");
		vscode.window.showErrorMessage(`Errors encountered parsing parameters of macros: \n${errorMessages}`);
	}

	macroCache = list;
}

/**
 * Parses the macros from the files without caching.
 */
const parseMacroList = async function () {
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

export const diagnostics = async function (document: vscode.TextDocument) {
	let d: vscode.Diagnostic[] = [];

	let collected = await collect(document.getText());

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

			if (el.open && !cur.skipArgs && vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.error").get("argumentParsing")) {
				let parsedArguments: ParsedArguments = parseArguments(document, el, cur);
				// Add any errors that we've found just from parsing to the diagnostics.
				for (let i = 0; i < parsedArguments.errors.length; i++) {
					let error = parsedArguments.errors[i];
					d.push({
						severity: vscode.DiagnosticSeverity.Error,
						range: error.range,
						message: error.message || "Unknown argument parsing failure",
						source: 'sc2-ex',
						code: 107,
					});
				}

				// Perform parameter validation.
				// Requires a setting to be enabled and it to be a parsed instance of parameters.
				// As well, we currently don't try checking if there was errors in parsing the 
				// arguments.
				if (parsedArguments.errors.length === 0 && vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.error").get("parameterValidation") && cur.parameters instanceof Parameters) {
					const parameters: Parameters = cur.parameters;
					const highestVariant = parameters.validate(parsedArguments);

					if (highestVariant.variantKey === null) {
						if (parameters.isEmpty()) {
							// There are no parameters!
							if (parsedArguments.arguments.length > 0) {
								// Construct a range covering all of the arguments
								let range = new vscode.Range(
									parsedArguments.arguments[0].range.start,
									parsedArguments.arguments[parsedArguments.arguments.length - 1].range.end
								);
								d.push({
									severity: vscode.DiagnosticSeverity.Error,
									range,
									message: `Expected no arguments, got ${parsedArguments.arguments.length} argument(s).`,
									source: `sc2-ex`,
									code: 108,
								});
							}
						} else {
							// TODO: What should we do in this situation where we failed to find a
							// variant but the parameters weren't empty? This might be an error due
							// to not matching any parameters and managing to not gain any rank, but
							// it starts at 0, so if there is a variant that shouldn't be possible.
							// but it might occur if we ever allow negative rank, so this could be a
							// 'failed to find variant that fit' error.
						}
					} else {
						// The end of the macro.
						const endRange = new vscode.Range(el.range.end.translate(0, -('<<'.length)), el.range.end);

						// Display any errors.
						for (let i = 0; i < highestVariant.info.errors.length; i++) {
							const error: ArgumentError = highestVariant.info.errors[i];
							const arg: Arg | undefined = parsedArguments.arguments[error.index];
							let range: vscode.Range;
							if (arg === undefined) {
								// Since if the arg is undefined it is probably about missing
								// argument errors
								range = endRange
							} else {
								range = arg.range;
							}

							d.push({
								severity: vscode.DiagnosticSeverity.Error,
								range,
								message: error.error.message,
								source: `sc2-ex`,
								code: 109,
							});
						}

						// Display any warnings.
						for (let i = 0; i < highestVariant.info.warnings.length; i++) {
							const warning: ArgumentWarning = highestVariant.info.warnings[i];
							const arg: Arg | undefined = parsedArguments.arguments[warning.index];
							let range: vscode.Range;
							if (arg === undefined) {
								range = endRange;
							} else {
								range = arg.range;
							}

							d.push({
								severity: vscode.DiagnosticSeverity.Warning,
								range,
								message: warning.warning.message,
								source: `sc2-ex`,
								code: 110,
							});
						}

						// Check if there is too many parameters
						// argIndex is the *current* index it got to.
						// So, it would be equivalent to length if it got to exactly the arguments
						// given.
						// We only do this if there were no errors though, as we may have
						// gotten an incorrect variant and we don't want to confuse the user more
						if (highestVariant.info.errors.length === 0 && parsedArguments.arguments.length > highestVariant.info.argIndex) {
							// Compute the range of extra arguments
							const exceedingArgs = parsedArguments.arguments
								.slice(highestVariant.info.argIndex);
							const start = exceedingArgs[0].range.start;
							const end = exceedingArgs[exceedingArgs.length - 1].range.end;
							const range = new vscode.Range(start, end);
							d.push({
								severity: vscode.DiagnosticSeverity.Error,
								range,
								message: `Too many arguments for variant '${highestVariant.variantKey}'`,
								source: `sc2-ex`,
								code: 111,
							})
						}
					}
				}
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