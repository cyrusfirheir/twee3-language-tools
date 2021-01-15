import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { Arg, ArgumentParseError, makeMacroArgumentsRange, parseArguments, ParsedArguments, UnparsedMacroArguments } from './arguments';
import { ArgumentError, ArgumentWarning, ChosenVariantInformation, Parameters, parseMacroParameters } from './parameters';
import * as macroListCore from './macros.json';
import { Passage } from '../tree-view';
import { isArrayEqual } from './validation';

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

	// Check for changed macros and clear those from the arguments cache.
	if (macroCache !== null) {
		for (const key in macroCache) {
			if (key in list) {
				if (!isMacroFunctionallyEquivalent(macroCache[key], list[key])) {
					// They weren't equivalent, thus we remove it from cache.
					argumentCache.clearMacro(key);
				}
			} else {
				// The macro no longer exists. Remove it from cache.
				argumentCache.clearMacro(key);
			}
		}
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


/**
 * Check if two macro definition are functionally equivalent.
 * Essentially a _loose_ check for if they would produce the same behavior. It errs on the side of
 * caution (and performance).
 */
function isMacroFunctionallyEquivalent(left: macroDef, right: macroDef): boolean {
	if (left.parameters === undefined || right.parameters === undefined) {
		if (left.parameters !== right.parameters) {
			// One of them is undefined whilst the other is not.
			return false;
		}
	} else {
		// They are both non-undefined
		if (!left.parameters.compare(right.parameters)) {
			return false;
		}
	}
	// Both of the above checks fall through in the valid case and we don't have to have ugly 
	// checks in the boolean expression below

	return left.name === right.name &&
		left.container === right.container &&
		left.selfClose === right.selfClose &&
		isArrayEqual(left.children, right.children) &&
		isArrayEqual(left.parents, right.parents) &&
		left.deprecated === right.deprecated &&
		isArrayEqual(left.deprecatedSuggestions, right.deprecatedSuggestions) &&
		left.skipArgs === right.skipArgs;
}

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

interface ArgumentCacheEntry {
	parsed: ParsedArguments,
	// This is null in several cases: errors in argument parsing, the setting being off, and there
	// being no parameters field on the macro definition.
	variant: ChosenVariantInformation | null,
	// The time it was last accessed at, used for dumping it from the cache.
	lastAccess: number,
}
/**
 * A class to cache results from parsing and validating arguments.
 * This will minor hurt performance in the initial parsing, but most argument parsing/validation is
 * the same as it was previously and so will help avoid abusing the user's cpu.
 */
class ArgumentCache {
	// So, the first level is the MacroName. This lets us identify the macro it is for easier.
	// Which is useful for two reasons
	// 	1. It lets us quickly clear all the entries under that macro name, such as when it is
	// 		updated in the settings file.
	//  2. (Primary reason). We can just use the arguments as the cache key, and so even if two
	//  	macro invocations have the same arguments they won't collide. Pretty simple, very little
	// 		special handling.
	// We use the arguments as the second ''level''-key so that it can be identified.
	// We do this rather than computing a hash for it ourselves, because the v8 engine already does
	// this in almost certainly a far better manner than we do.
	// Though there is a downside in memory due to storing these strings instead of a far smaller
	// hash computed by ourselves, it was deemed 'probably fine' after.. much thought.
	private cache: Record<MacroName, Record<UnparsedMacroArguments, ArgumentCacheEntry>>

	private cacheCleanerInterval: NodeJS.Timeout | undefined;

	constructor() {
		this.cache = Object.create(null);
		this.initializeCacheCleaner();
	}

	// TODO: let this be user customizable
	// 5 minutes
	private static cacheCleanerDelay: number = (1000 * 60) * 5;
	private initializeCacheCleaner() {
		if (this.cacheCleanerInterval !== undefined) {
			clearInterval(this.cacheCleanerInterval);
		}

		this.cacheCleanerInterval = setInterval(() => {
			this.cleanCache();
		}, ArgumentCache.cacheCleanerDelay);
	}

	// TODO: let this be user customizable
	// 5 minutes
	// The amount of time between the last access and now before it is allowed to be removed.
	private static cacheMinLastAccess: number = (1000 * 60) * 2;
	cleanCache() {
		let current = Date.now();
		for (const name in this.cache) {
			for (const args in this.cache[name]) {
				if (current - this.cache[name][args].lastAccess >= ArgumentCache.cacheMinLastAccess) {
					delete this.cache[name][args];
				}
			}
		}
	}

	/**
	 * Clear the entire cache.
	 */
	clear() {
		this.cache = Object.create(null);
	}

	/**
	 * Clear a specific macro from the cache. This is used for when macro definitions are updated
	 * which can change parsing despite having the same arguments
	 * @param name The name of the macor
	 */
	clearMacro(name: MacroName) {
		if (name in this.cache) {
			delete this.cache[name];
		}
	}

	/**
	 * Gets a cache entry, otherwise creates it with the given `construct` function.
	 * @param name The name of the macro.
	 * @param args The string of arguments that the macro received
	 * @param construct A function to construct the entry if it did not exist.
	 */
	getInsert(name: MacroName, args: UnparsedMacroArguments, construct: () => ArgumentCacheEntry): ArgumentCacheEntry {
		// If caching is not enabled, we just make the cache immediately construct and return
		// without storing it.
		if (!vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.cache").get("argumentInformation")) {
			return construct();
		}


		if (!(name in this.cache)) {
			this.cache[name] = Object.create(null);
		}

		if (!(args in this.cache[name])) {
			// Even if this errors, the cache should still be in a valid state.
			this.cache[name][args] = construct();
		}

		this.cache[name][args].lastAccess = Date.now();
		return this.cache[name][args];
	}
}
export const argumentCache: ArgumentCache = new ArgumentCache();

export const diagnostics = async function (ctx: vscode.ExtensionContext, document: vscode.TextDocument) {
	let d: vscode.Diagnostic[] = [];

	let collected = await collect(document.getText());
	const passages: Passage[] = ctx.workspaceState.get("passages", []);

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
				const lexRange: vscode.Range = makeMacroArgumentsRange(el);
				const args: UnparsedMacroArguments = document.getText(lexRange);

				// TODO: Potential future feature would making the cache simply hold the
				// diagnostics themselves rather than reconstructing them each time.
				const cacheEntry = argumentCache.getInsert(el.name, args, () => {
					const parsedArguments: ParsedArguments = parseArguments(args, lexRange, el, cur);
					let chosenVariant: ChosenVariantInformation | null = null;
					if (parsedArguments.errors.length === 0 && vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.error").get("parameterValidation") && cur.parameters instanceof Parameters) {
						const parameters: Parameters = cur.parameters;
						chosenVariant = parameters.validate(parsedArguments, {
							passages,
						});
					}

					return {
						parsed: parsedArguments,
						variant: chosenVariant,
						lastAccess: Date.now(),
					};
				});

				const parsedArguments = cacheEntry.parsed;
				const highestVariant = cacheEntry.variant;

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

				if (vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.error").get("parameterValidation") && highestVariant !== null && cur.parameters instanceof Parameters) {
					const parameters: Parameters = cur.parameters;
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