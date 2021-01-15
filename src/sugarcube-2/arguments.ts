import { info } from 'console';
import * as vscode from 'vscode';
import { Passage } from '../tree-view';
import { macro, macroDef } from "./macros";
import { evalPassageId, Evaluatable, evaluateTwineScriptString, StateInfo, Warning } from './validation';

// Note: Much of this file has come from SugarCube2, though it is modified for simplicities sake.

type LexerState<T> = (lexer: Lexer<T>) => null | LexerState<T>;
interface LexerEntry<T> {
	type: T,
	text: string,
	start: number,
	position: number,
}
interface LexerError<T> extends LexerEntry<T> {
	message: string,
}
type LexerItem<T> = LexerEntry<T> | LexerError<T>;

// The EOF type so that we can specify a function that can return end-of-file.
type EOFT = -1;
const EOF: EOFT = -1;
class Lexer<T> {
	/**
	 * The text that is being lexed
	 */
	readonly source: string;
	/**
	 * A function that is the active state, essentially forming a state machine.
	 */
	state: LexerState<T> | null;
	/**
	 * The start of an entry
	 */
	start: number = 0;
	/**
	 * Position within the source
	 */
	pos: number = 0;
	/**
	 * Current nesting depth of ()/{}/[]
	 */
	depth: number = 0;
	/**
	 * Parsed entries/errors.
	 */
	items: LexerItem<T>[] = [];
	/**
	 * Data
	 */
	data: Record<string, any> = {};

	constructor(source: string, initial: LexerState<T>) {
		this.source = source;
		this.state = initial;
	}

	/**
	 * Run the lexer on the source.
	 * @returns {LexerItem<T>} The items that were parsed (`this.items`)
	 */
	run(): LexerItem<T>[] {
		while (this.state !== null) {
			this.state = this.state(this);
		}

		return this.items;
	}

	/**
	 * Acquire next character, or receive EOF.
	 * Advances position.
	 */
	next(): EOFT | string {
		let ch = this.peek();
		this.pos++;
		return ch;
	}

	/**
	 * Acquire next character, or receive EOF.
	 * Does not advance position.
	 */
	peek(): EOFT | string {
		if (this.pos >= this.source.length) {
			return EOF;
		}
		return this.source[this.pos];
	}

	backup(num?: number) {
		this.pos -= num || 1;
	}

	forward(num?: number) {
		this.pos += num || 1;
	}

	ignore() {
		this.start = this.pos;
	}

	accept(valid: string): boolean {
		const ch = this.next();

		if (ch == EOF) {
			return false;
		} else if (valid.includes(ch as string)) {
			return true;
		} else {
			this.backup();
			return false;
		}
	}

	acceptRun(valid: string) {
		for (; ;) {
			const ch = this.next();

			if (ch == EOF) {
				return;
			} else if (!valid.includes(ch as string)) {
				break;
			}
		}

		this.backup();
	}

	emit(type: T) {
		this.items.push({
			type,
			text: this.source.slice(this.start, this.pos),
			start: this.start,
			position: this.pos,
		});
		this.start = this.pos;
	}

	error(type: T, message: string): null {
		this.items.push({
			type,
			message,
			text: this.source.slice(this.start, this.pos),
			start: this.start,
			position: this.pos,
		});
		return null;
	}
}

export interface ParsedArguments {
	/// Errors encountered whilst parsing
	/// If this has entries then it may mean that the rest of the arguments were not parsed
	errors: ArgumentParseError[],
	/// Warnings about parts that have been parsed. These are ones we can manage to skip past and
	// continue, usually due to guessing what you meant.
	warnings: ArgumentParseWarning[],
	arguments: Arg[],
}
export enum ArgumentParseErrorKind {
	Failure,
	SquareBracketFailure,
	SquareBracketExpectedCharacter,
}
export interface ArgumentParseError {
	kind: ArgumentParseErrorKind,
	message?: string,
	range: vscode.Range,
}
export enum ArgumentParseWarningKind {
	InvalidPassageName,
}
export interface ArgumentParseWarning {
	kind: ArgumentParseWarningKind,
	message?: string,
	range: vscode.Range,
}


export enum ArgType {
	// These are from link
	Link,
	Image,
	// These are from Bareword
	Variable,
	SettingsSetupAccess,
	Null,
	Undefined,
	True,
	False,
	NaN,
	Number,
	// Unknown Bareword.
	Bareword,
	// These are from Expression
	EmptyExpression,
	Expression,
	// These are from String
	String,
}
export type Arg = LinkArgument | ImageArgument | VariableArgument | SettingsSetupAccessArgument | LoneArg<ArgType.Null> | LoneArg<ArgType.Undefined> | LoneArg<ArgType.True> | LoneArg<ArgType.False> | LoneArg<ArgType.NaN> | NumberArgument | BarewordArgument | LoneArg<ArgType.EmptyExpression> | ExpressionArgument | StringArgument;
// For arguments that are simply their variant.
type LoneArg<T> = { type: T, range: vscode.Range, };
export interface LinkArgument {
	type: ArgType.Link,
	range: vscode.Range,
	// The passage (or an expression to calculate it)
	passage?: Evaluatable<string, string>,
	syntax: LinkSyntax,
	// The text that is displayed
	// If this is not set then the text is the passage name.
	text?: string,
	setter?: string,
	// Note: currently no support for external (bool for whether it is an external link)
	// because it requires evaluating the passage
	// external: boolean,
}
export enum LinkSyntax {
	// Known as count: 1 in SugarCube
	// [[alpha]]
	Wiki,
	// Known as count: 2 in SugarCube
	// [[alpha|beta]]
	Pretty,
}
export interface ImageArgument {
	type: ArgType.Image,
	range: vscode.Range,
	image: Evaluatable<string, string>,
	passage?: Evaluatable<string, string>,
	align?: 'left' | 'right',
	// TODO: This could be evaluatable
	title?: string,
	setter?: string,
	// See: linkArgument for why this does not currently exist.
	// external: boolean,
}
export interface VariableArgument {
	type: ArgType.Variable,
	// Just the name, so the argument.
	variable: string,
	range: vscode.Range,
}
export interface SettingsSetupAccessArgument {
	type: ArgType.SettingsSetupAccess,
	access: string,
	range: vscode.Range,
}
export interface NumberArgument {
	type: ArgType.Number,
	value: number,
	range: vscode.Range,
}
export interface BarewordArgument {
	type: ArgType.Bareword,
	value: string,
	range: vscode.Range,
}
export interface ExpressionArgument {
	type: ArgType.Expression,
	expression: string,
	range: vscode.Range,
}
export interface StringArgument {
	type: ArgType.String,
	text: string,
	range: vscode.Range,
}

/**
 * Acquire a range over the macro's arguments.
 * Returns null if it was a closing macro.
 * @param macro
 * @throws {Error} if macro is open
 */
export function makeMacroArgumentsRange(macro: macro): vscode.Range {
	if (!macro.open) {
		throw new Error("Expected opening macro to parse arguments of.");
	}

	const afterMacroName = macro.range.start.translate(0, '<<'.length + macro.name.length);
	const beforeMacroClose = macro.range.end.translate(0, -('>>'.length));
	// Constrain text to the macro, so we don't accidentally start parsing the entire file due to a
	// mistake
	// Note: this means later places where we use positions within the text need to be offset to get
	// accurate results.
	return new vscode.Range(afterMacroName, beforeMacroClose);
}

export type UnparsedMacroArguments = string;

/**
 * Parses the arguments passed into an ParsedArguments structure.
 * Returns a partial ParsedArguments structure if it failed, with the `valid` bool set to false.
 * @param macro The macro in the file, giving us a position to parse at. Should be the opening the
 * macro, otherwise an error is thrown.
 * @param macroDefinition The definition of the macro so that we can check it
 * @param text The text of the file
 * @throws {Error}
 */
export function parseArguments(source: UnparsedMacroArguments, lexRange: vscode.Range, macro: macro, macroDefinition: macroDef, state: StateInfo): ParsedArguments {
	function makeRange(item: LexerItem<MacroParse.Item>): vscode.Range {
		// Note: Since we only ran the parser on a portion of the macro, we have to offset it
		// in order to get the valid range.
		let start = lexRange.start.translate(0, item.start);
		let end = lexRange.start.translate(0, item.position);
		return new vscode.Range(start, end);
	}

	function makeError(kind: ArgumentParseErrorKind, item: LexerItem<MacroParse.Item>, message: string): ArgumentParseError {
		return {
			kind,
			message,
			range: makeRange(item),
		};
	}

	let args: ParsedArguments = {
		errors: [],
		warnings: [],
		arguments: [],
	};

	const lexer: Lexer<MacroParse.Item> = new Lexer(source, MacroParse.lexSpace);
	const items = lexer.run();
	// Note: For now, we don't try to continue if there was an error in parsing.
	// It may be possible (?, at least in a few cases) to evaluate multiple errors
	// but we're more likely to just spit out more errors due to the same garbage input.
	loop: for (let i = 0; i < items.length; i++) {
		let item = items[i];
		let arg = item.text;
		let range = makeRange(item);

		switch (item.type) {
			case MacroParse.Item.Error:
				args.errors.push(makeError(ArgumentParseErrorKind.Failure, item, `unable to parse macro argument: "${arg}": ${(item as LexerError<MacroParse.Item>).message}`));
				break loop;
			case MacroParse.Item.Bareword:
				// This imitates the parsing of Barewords in the original code
				// Though, we turn them into unique Argument types
				if (varTestRegexp.test(arg)) {
					// SugarCube would access the variable within the state here.
					args.arguments.push({
						type: ArgType.Variable,
						variable: arg,
						range,
					});
				} else if (settingsSetupAccessRegexp.test(arg)) {
					// SugarCube would evaluate this, throwing an error if it was invalid.
					// Thus it is deemed safe to turn it into an argument
					args.arguments.push({
						type: ArgType.SettingsSetupAccess,
						access: arg,
						range,
					});
				} else if (arg === 'null') {
					args.arguments.push({
						type: ArgType.Null,
						range,
					});
				} else if (arg === 'undefined') {
					args.arguments.push({
						type: ArgType.Undefined,
						range,
					});
				} else if (arg === 'true') {
					args.arguments.push({
						type: ArgType.True,
						range,
					});
				} else if (arg === 'false') {
					args.arguments.push({
						type: ArgType.False,
						range,
					});
				} else if (arg === 'NaN') {
					args.arguments.push({
						type: ArgType.NaN,
						range,
					});
				} else {
					const argAsNum = Number(arg);

					if (!Number.isNaN(argAsNum)) {
						args.arguments.push({
							type: ArgType.Number,
							value: argAsNum,
							range,
						});
					} else {
						args.arguments.push({
							type: ArgType.Bareword,
							value: arg,
							range,
						});
					}
				}
				break;
			case MacroParse.Item.Expression:
				// Remove backspaces and remove extraneous whitespace.
				arg = arg.slice(1, -1).trim();

				if (arg === '') {
					args.arguments.push({
						type: ArgType.EmptyExpression,
						range,
					});
				} else {
					// Normally the code would be evaluated here.
					args.arguments.push({
						type: ArgType.Expression,
						expression: arg,
						range,
					});
				}
				break;
			case MacroParse.Item.String:
				// All SugarCube does is try evaluating the string as javascript to handle escaped
				// characters.
				// TODO: technically we could handle escaped characters (if that is all it does,
				// but I am uncertain about that) manually.
				// Remove quotation marks from string.
				arg = arg.slice(1, -1);
				args.arguments.push({
					type: ArgType.String,
					text: arg,
					range,
				});
				break;
			case MacroParse.Item.SquareBracket:
				{
					const markup = parseSquareBracketedMarkup({
						source: arg,
						matchStart: 0,
					});

					if (markup.hasOwnProperty('error')) {
						args.errors.push(makeError(ArgumentParseErrorKind.SquareBracketFailure, item, markup.error as string));
						break loop;
					}
					if (markup.position < arg.length) {
						args.errors.push(makeError(ArgumentParseErrorKind.SquareBracketExpectedCharacter, item, `unable to parse macro argument "${arg}": unexpected character(s) "${arg.slice(markup.position)}"(pos: ${markup.position})`));
						break loop;
					}

					// It is a link or an image
					if (markup.isLink) {
						let arg: LinkArgument = {
							type: ArgType.Link,
							syntax: LinkSyntax.Wiki,
							range,
						};
						if (markup.hasOwnProperty('text')) {
							arg.text = markup.text;
							arg.syntax = LinkSyntax.Pretty;
						}
						if (markup.setter) {
							arg.setter = markup.setter;
						}
						if (markup.link) {
							arg.passage = checkPassageId(state.passages, markup.link as string, range, args.warnings);
						}
						args.arguments.push(arg);
					} else if (markup.isImage) {
						let arg: ImageArgument = {
							type: ArgType.Image,
							// TODO: should we assume that source is a string?
							image: checkPassageId(state.passages, markup.source as string, range, args.warnings),
							range,
						};

						if (markup.hasOwnProperty('align')) {
							arg.align = markup.align;
						}

						if (markup.hasOwnProperty('text')) {
							arg.title = markup.text;
						}

						if (markup.hasOwnProperty('link')) {
							arg.passage = checkPassageId(state.passages, markup.link as string, range, args.warnings);
						}

						if (markup.hasOwnProperty('setter')) {
							arg.setter = markup.setter;
						}
						args.arguments.push(arg);
					}
				}
				break;
		}
	}
	return args;
}

/**
 *
 * @param passage The unevaluated twinescript for a passage
 * @param warningsOutput an array to output a warning if we get one
 */
function checkPassageId(passages: Passage[], passage: string, range: vscode.Range, warningsOutput: ArgumentParseWarning[]): Evaluatable<string, string> {
	const argPassage = evalPassageId(passages, passage);
	if (argPassage.isEvaluated) {
		console.log("Checking", argPassage.value);
		if (!passages.find(passage => passage.name === argPassage.value)) {
			warningsOutput.push({
				kind: ArgumentParseWarningKind.InvalidPassageName,
				message: "Nonexistent passage",
				range,
			});
		}
	}
	return argPassage;
}




interface MarkupInput {
	source: string,
	matchStart: number,
}

interface MarkupData {
	error?: string,
	isImage: boolean,
	isLink: boolean,
	align?: 'left' | 'right',
	position: number,
	forceInternal?: boolean,
	link?: string,
	setter?: string,
	source?: string,
	text?: string,
}

// Parse function.
function parseSquareBracketedMarkup(w: MarkupInput): MarkupData {
	// Initialize the lexer.
	const lexer = new Lexer(w.source, SquareBracketParsing.lexLeftMeta);

	// Set the initial positions within the source string.
	lexer.start = lexer.pos = w.matchStart;

	// Lex the raw argument string.
	const markup: Partial<MarkupData> = {
		isImage: false,
		isLink: false,
	};
	const items = lexer.run();
	const last = items[items.length - 1];

	if (last && last.type === SquareBracketParsing.Item.Error) {
		markup.error = (last as LexerError<SquareBracketParsing.Item>).message;
	} else {
		items.forEach(item => {
			const text = item.text.trim();

			switch (item.type) {
				case SquareBracketParsing.Item.ImageMeta:
					markup.isImage = true;

					if (text[1] === '<') {
						markup.align = 'left';
					}
					else if (text[1] === '>') {
						markup.align = 'right';
					}
					break;

				case SquareBracketParsing.Item.LinkMeta:
					markup.isLink = true;
					break;

				case SquareBracketParsing.Item.Link:
					if (text[0] === '~') {
						markup.forceInternal = true;
						markup.link = text.slice(1);
					}
					else {
						markup.link = text;
					}
					break;

				case SquareBracketParsing.Item.Setter:
					markup.setter = text;
					break;

				case SquareBracketParsing.Item.Source:
					markup.source = text;
					break;

				case SquareBracketParsing.Item.Text:
					markup.text = text;
					break;
			}
		});
	}

	markup.position = lexer.pos;
	return markup as MarkupData;
}

function isExternalLink(link: string) {
	// TODO: check if it is a passage
	// if (Story.has(link)) {
	//     return false;
	// }

	const urlRegExp = /^(?:file|https?|mailto|ftp|javascript|irc|news|data):[^\s'"]+/gim;
	return urlRegExp.test(link) || /[/.?#]/.test(link);
}


// Much of the code following this is essentially modified SugarCube code, though
// for the most part just adding types and changing small parts.

// SugarCube has more complex checks for these, but we're only supporting VSCode and assume its
// whitespace handling is sane.
const notSpaceRegex: RegExp = /\S/;
const spaceRegex: RegExp = /\s/;
const varTestRegexp: RegExp = /^[$_][$A-Z_a-z][$0-9A-Z_a-z]*/;
const settingsSetupAccessRegexp: RegExp = /^(?:settings|setup)[.[]/;

namespace MacroParse {
	export enum Item {
		Error,
		Bareword,
		Expression,
		String,
		SquareBracket,
	};

	// Lexing functions.
	function slurpQuote(lexer: Lexer<Item>, endQuote: string): EOFT | number {
		loop: for (; ;) {
			/* eslint-disable indent */
			switch (lexer.next()) {
				case '\\':
					{
						const ch = lexer.next();

						if (ch !== EOF && ch !== '\n') {
							break;
						}
					}
				/* falls through */
				case EOF:
				case '\n':
					return EOF;

				case endQuote:
					break loop;
			}
			/* eslint-enable indent */
		}

		return lexer.pos;
	}

	export function lexSpace(lexer: Lexer<Item>): LexerState<Item> | null {
		const offset = lexer.source.slice(lexer.pos).search(notSpaceRegex);

		if (offset === EOF) {
			// no non-whitespace characters, so bail
			return null;
		}
		else if (offset !== 0) {
			lexer.pos += offset;
			lexer.ignore();
		}

		// determine what the next state is
		switch (lexer.next()) {
			case '`':
				return lexExpression;
			case '"':
				return lexDoubleQuote;
			case "'":
				return lexSingleQuote;
			case '[':
				return lexSquareBracket;
			default:
				return lexBareword;
		}
	}

	function lexExpression(lexer: Lexer<Item>): LexerState<Item> | null {
		if (slurpQuote(lexer, '`') === EOF) {
			return lexer.error(Item.Error, 'unterminated backquote expression');
		}

		lexer.emit(Item.Expression);
		return lexSpace;
	}

	function lexDoubleQuote(lexer: Lexer<Item>): LexerState<Item> | null {
		if (slurpQuote(lexer, '"') === EOF) {
			return lexer.error(Item.Error, 'unterminated double quoted string');
		}

		lexer.emit(Item.String);
		return lexSpace;
	}

	function lexSingleQuote(lexer: Lexer<Item>): LexerState<Item> | null {
		if (slurpQuote(lexer, "'") === EOF) {
			return lexer.error(Item.Error, 'unterminated single quoted string');
		}

		lexer.emit(Item.String);
		return lexSpace;
	}

	function lexSquareBracket(lexer: Lexer<Item>): LexerState<Item> | null {
		const imgMeta = '<>IiMmGg';
		let what;

		if (lexer.accept(imgMeta)) {
			what = 'image';
			lexer.acceptRun(imgMeta);
		}
		else {
			what = 'link';
		}

		if (!lexer.accept('[')) {
			return lexer.error(Item.Error, `malformed ${what} markup`);
		}

		lexer.depth = 2; // account for both initial left square brackets

		loop: for (; ;) {
			/* eslint-disable indent */
			switch (lexer.next()) {
				case '\\':
					{
						const ch = lexer.next();

						if (ch !== EOF && ch !== '\n') {
							break;
						}
					}
				/* falls through */
				case EOF:
				case '\n':
					return lexer.error(Item.Error, `unterminated ${what} markup`);

				case '[':
					++lexer.depth;
					break;

				case ']':
					--lexer.depth;

					if (lexer.depth < 0) {
						return lexer.error(Item.Error, "unexpected right square bracket ']'");
					}

					if (lexer.depth === 1) {
						if (lexer.next() === ']') {
							--lexer.depth;
							break loop;
						}
						lexer.backup();
					}
					break;
			}
			/* eslint-enable indent */
		}

		lexer.emit(Item.SquareBracket);
		return lexSpace;
	}

	function lexBareword(lexer: Lexer<Item>): LexerState<Item> | null {
		const offset = lexer.source.slice(lexer.pos).search(spaceRegex);
		lexer.pos = offset === EOF ? lexer.source.length : lexer.pos + offset;
		lexer.emit(Item.Bareword);
		return offset === EOF ? null : lexSpace;
	}

}



// Note: This was originally an anonymous namespace, but it was moved out of that.
// As well, the original function (`parseSquareBracketedMarkup`) has been notably modified
// to provide better typed results, but it is defined above in the file separately to
// make life somewhat saner if the below needs updating.
namespace SquareBracketParsing {
	export enum Item {
		Error,     // error
		DelimLTR,  // '|' or '->'
		DelimRTL,  // '<-'
		InnerMeta, // ']['
		ImageMeta, // '[img[', '[<img[', or '[>img['
		LinkMeta,  // '[['
		Link,      // link destination
		RightMeta, // ']]'
		Setter,    // setter expression
		Source,    // image source
		Text       // link text or image alt text
	}
	enum Delim {
		None, // no delimiter encountered
		LTR,  // '|' or '->'
		RTL   // '<-'
	}

	// Lexing functions.
	function slurpQuote(lexer: Lexer<Item>, endQuote: string): EOFT | number {
		loop: for (; ;) {
			switch (lexer.next()) {
				case '\\':
					{
						const ch = lexer.next();

						if (ch !== EOF && ch !== '\n') {
							break;
						}
					}
				/* falls through */
				case EOF:
				case '\n':
					return EOF;

				case endQuote:
					break loop;
			}
		}

		return lexer.pos;
	}

	export function lexLeftMeta(lexer: Lexer<Item>) {
		if (!lexer.accept('[')) {
			return lexer.error(Item.Error, 'malformed square-bracketed markup');
		}

		// Is link markup.
		if (lexer.accept('[')) {
			lexer.data.isLink = true;
			lexer.emit(Item.LinkMeta);
		}

		// May be image markup.
		else {
			lexer.accept('<>'); // aligner syntax

			if (!lexer.accept('Ii') || !lexer.accept('Mm') || !lexer.accept('Gg') || !lexer.accept('[')) {
				return lexer.error(Item.Error, 'malformed square-bracketed markup');
			}

			lexer.data.isLink = false;
			lexer.emit(Item.ImageMeta);
		}

		lexer.depth = 2; // account for both initial left square brackets
		return lexCoreComponents;
	}

	function lexCoreComponents(lexer: Lexer<Item>) {
		const what = lexer.data.isLink ? 'link' : 'image';
		let delim = Delim.None;

		for (; ;) {
			switch (lexer.next()) {
				case EOF:
				case '\n':
					return lexer.error(Item.Error, `unterminated ${what} markup`);

				case '"':
					/*
						This is not entirely reliable within sections that allow raw strings, since
						it's possible, however unlikely, for a raw string to contain unpaired double
						quotes.  The likelihood is low enough, however, that I'm deeming the risk as
						acceptable—for now, at least.
					*/
					if (slurpQuote(lexer, '"') === EOF) {
						return lexer.error(Item.Error, `unterminated double quoted string in ${what} markup`);
					}
					break;

				case '|': // possible pipe ('|') delimiter
					if (delim === Delim.None) {
						delim = Delim.LTR;
						lexer.backup();
						lexer.emit(Item.Text);
						lexer.forward();
						lexer.emit(Item.DelimLTR);
						// lexer.ignore();
					}
					break;

				case '-': // possible right arrow ('->') delimiter
					if (delim === Delim.None && lexer.peek() === '>') {
						delim = Delim.LTR;
						lexer.backup();
						lexer.emit(Item.Text);
						lexer.forward(2);
						lexer.emit(Item.DelimLTR);
						// lexer.ignore();
					}
					break;

				case '<': // possible left arrow ('<-') delimiter
					if (delim === Delim.None && lexer.peek() === '-') {
						delim = Delim.RTL;
						lexer.backup();
						lexer.emit(lexer.data.isLink ? Item.Link : Item.Source);
						lexer.forward(2);
						lexer.emit(Item.DelimRTL);
						// lexer.ignore();
					}
					break;

				case '[':
					++lexer.depth;
					break;

				case ']':
					--lexer.depth;

					if (lexer.depth === 1) {
						switch (lexer.peek()) {
							case '[':
								++lexer.depth;
								lexer.backup();

								if (delim === Delim.RTL) {
									lexer.emit(Item.Text);
								}
								else {
									lexer.emit(lexer.data.isLink ? Item.Link : Item.Source);
								}

								lexer.forward(2);
								lexer.emit(Item.InnerMeta);
								// lexer.ignore();
								return lexer.data.isLink ? lexSetter : lexImageLink;

							case ']':
								--lexer.depth;
								lexer.backup();

								if (delim === Delim.RTL) {
									lexer.emit(Item.Text);
								}
								else {
									lexer.emit(lexer.data.isLink ? Item.Link : Item.Source);
								}

								lexer.forward(2);
								lexer.emit(Item.RightMeta);
								// lexer.ignore();
								return null;

							default:
								return lexer.error(Item.Error, `malformed ${what} markup`);
						}
					}
					break;
			}
		}
	}

	function lexImageLink(lexer: Lexer<Item>) {
		const what = lexer.data.isLink ? 'link' : 'image';

		for (; ;) {
			switch (lexer.next()) {
				case EOF:
				case '\n':
					return lexer.error(Item.Error, `unterminated ${what} markup`);

				case '"':
					/*
						This is not entirely reliable within sections that allow raw strings, since
						it's possible, however unlikely, for a raw string to contain unpaired double
						quotes.  The likelihood is low enough, however, that I'm deeming the risk as
						acceptable—for now, at least.
					*/
					if (slurpQuote(lexer, '"') === EOF) {
						return lexer.error(Item.Error, `unterminated double quoted string in ${what} markup link component`);
					}
					break;

				case '[':
					++lexer.depth;
					break;

				case ']':
					--lexer.depth;

					if (lexer.depth === 1) {
						switch (lexer.peek()) {
							case '[':
								++lexer.depth;
								lexer.backup();
								lexer.emit(Item.Link);
								lexer.forward(2);
								lexer.emit(Item.InnerMeta);
								// lexer.ignore();
								return lexSetter;

							case ']':
								--lexer.depth;
								lexer.backup();
								lexer.emit(Item.Link);
								lexer.forward(2);
								lexer.emit(Item.RightMeta);
								// lexer.ignore();
								return null;

							default:
								return lexer.error(Item.Error, `malformed ${what} markup`);
						}
					}
					break;
			}
		}
	}

	function lexSetter(lexer: Lexer<Item>) {
		const what = lexer.data.isLink ? 'link' : 'image';

		for (; ;) {
			switch (lexer.next()) {
				case EOF:
				case '\n':
					return lexer.error(Item.Error, `unterminated ${what} markup`);

				case '"':
					if (slurpQuote(lexer, '"') === EOF) {
						return lexer.error(Item.Error, `unterminated double quoted string in ${what} markup setter component`);
					}
					break;

				case "'":
					if (slurpQuote(lexer, "'") === EOF) {
						return lexer.error(Item.Error, `unterminated single quoted string in ${what} markup setter component`);
					}
					break;

				case '[':
					++lexer.depth;
					break;

				case ']':
					--lexer.depth;

					if (lexer.depth === 1) {
						if (lexer.peek() !== ']') {
							return lexer.error(Item.Error, `malformed ${what} markup`);
						}

						--lexer.depth;
						lexer.backup();
						lexer.emit(Item.Setter);
						lexer.forward(2);
						lexer.emit(Item.RightMeta);
						// lexer.ignore();
						return null;
					}
					break;
			}
		}
	}
}