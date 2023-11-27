/***
 * The code herein was pared-down and minimimally edited by S. 
 * Herring from:
 * 		Baptiste "Zokugun" Augrain's Explicit Folding extension for 
 * VSCode, licensed under the MIT License.
 * https://github.com/zokugun/vscode-explicit-folding
 *  	Baptiste "Zokugun" Augrain's VSCpde Explicit Folding API, 
 * licensed under the MIT License.
 * https://github.com/zokugun/vscode-explicit-folding-api
 * 
 * Due to the terms of the MIT License, the code in this file is 
 * licensed under the MIT License.
 * The MIT License may be found below.
 * 
 * 
 * Copyright (c) 2023 S. Herring
 * Copyright (c) 2018-present Baptiste Augrain
 * Copyright (c) 2021 Baptiste Augrain
 * 
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */

import * as vscode from "vscode";
import {
	FoldingRange,
	FoldingRangeKind,
	FoldingRangeProvider,
	ProviderResult,
	TextDocument,
	window
} from 'vscode';
import {
	parse,
	translate,
	visit,
	Flavor,
	TokenType
} from '@daiyam/regexp';
import { PackageLanguages } from "../extension";

const getProjectLanguages = () => PackageLanguages;

// LEAH: This is the amount of miliseconds before the MainProvider.
const DELAY = 40;

const TAB = 9;
const SPACE = 32;

const SCHEMES = ['file', 'untitled', 'vscode-userdata'];

let $context: vscode.ExtensionContext | null = null;

enum Marker {
	DOCSTRING,
}

type EndMatcher = (escape: (value: string) => string, offset: number, ...args: string[]) => string;

interface GroupContext {
	index: number;
}

interface PreviousRegion {
	begin: number;
	end: number;
	indent: number;
}

interface Position {
	line: number;
	offset: number;
}

interface Rule {
	index: number;
	begin ? : RegExp;
	end ? : RegExp;
	loopRegex ? : RegExp;
	endMatcher ? : EndMatcher;
}

interface StackItem {
	rule: Rule;
	line: number;
	endIndex ? : number;
}

class Disposable extends vscode.Disposable {
	private subscriptions: vscode.Disposable[] = [];

	constructor() {
		super(() => {
			// do nothing
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();

		this.subscriptions.length = 0;
	}

	push(disposable: vscode.Disposable) {
		this.subscriptions.push(disposable);
	}
}


interface ExplicitFoldingHub {
	registerFoldingRules(language: string, rules: Array < ExplicitFoldingConfig > ): void;
	unregisterFoldingRules(language: string): void;
}

interface ExplicitFoldingConfig {};

class FoldingHub implements ExplicitFoldingHub {
	private perLanguages: Record < string, ExplicitFoldingConfig[] | undefined > = {};
	private readonly setup: () => void;

	constructor(setup: () => void) {
		this.setup = setup;
	}

	getRules(language: string): ExplicitFoldingConfig[] | undefined {
		return this.perLanguages[language];
	}

	hasRules(language: string): boolean {
		return typeof this.perLanguages[language] !== 'undefined';
	}

	registerFoldingRules(language: string, rules: ExplicitFoldingConfig[]): void {
		this.perLanguages[language] = rules;

		this.setup();
	}

	unregisterFoldingRules(language: string): void {
		this.perLanguages[language] = undefined;

		this.setup();
	}
}

const $disposable: Disposable = new Disposable();
const $documents: vscode.TextDocument[] = [];
const $hub = new FoldingHub(setupProviders);

class MainProvider implements vscode.FoldingRangeProvider {
	public id = 'explicit';
	private providers: Record < string, boolean > = {};

	provideFoldingRanges(document: vscode.TextDocument): vscode.ProviderResult < vscode.FoldingRange[] > {
		if (!this.providers[document.languageId]) {
			this.providers[document.languageId] = true;

			const delay = DELAY;

			if (delay > 0) {
				setTimeout(() => {
					this.setup(document);
				}, delay);
			} else {
				this.setup(document);
			}
		}

		return [];
	}

	setup(document: vscode.TextDocument) {
		const language = document.languageId;

		const provider = new FoldingProvider();

		for (const scheme of [...SCHEMES]) {
			const disposable = vscode.languages.registerFoldingRangeProvider({
				language,
				scheme
			}, provider);

			$disposable.push(disposable);
		}

		foldDocument(document);
	}
}

function foldDocument(document: vscode.TextDocument) {
	try {
		const level = Number.parseInt('none', 10);

		void vscode.commands.executeCommand('editor.unfoldAll');

		for (let i = 7; i >= level; --i) {
			void vscode.commands.executeCommand(`editor.foldLevel${i}`);
		}
	} catch {

	}

	if (!$documents.includes(document)) {
		$documents.push(document);
	}
}

function setupProviders() {
	$disposable.dispose();

	const provider = new MainProvider();

	void vscode.languages.getLanguages().then((languages) => {
		for (const language of languages) {
			if (getProjectLanguages().includes(language)) {
				for (const scheme of SCHEMES) {
					const disposable = vscode.languages.registerFoldingRangeProvider({
						language,
						scheme
					}, provider);

					$disposable.push(disposable);
				}
			}
		}
	});

	$context!.subscriptions.push($disposable);
}

function computeIndentLevel(line: string, tabSize: number): number {
	let indent = 0;
	let i = 0;
	const length = line.length;

	while (i < length) {
		const chCode = line.codePointAt(i);

		if (chCode === SPACE) {
			indent++;
		} else if (chCode === TAB) {
			indent = indent - (indent % tabSize) + tabSize;
		} else {
			break;
		}

		i++;
	}

	if (i === length) {
		return -1; // line only consists of whitespace
	}

	return indent;
}

class FoldingProvider implements FoldingRangeProvider {
	public id = 'explicit';
	public isManagingLastLine = true;
	private readonly mainRegex: RegExp;
	private readonly rules: Rule[] = [];

	constructor() {
		const groupContext = {
			index: 0
		};

		let source = '';

		if (this.addRegex(groupContext).length > 0) {
			if (source.length > 0) {
				source += '|';
			}

			source += this.addRegex(groupContext);
		}

		this.mainRegex = source.length === 0 ? /a^/ : new RegExp(source, 'g');
	}

	public provideFoldingRanges(document: TextDocument): ProviderResult < FoldingRange[] > {
		const foldingRanges: FoldingRange[] = [];
		const stack: StackItem[] = [];

		let position: Position = {
			line: 0,
			offset: 0
		};

		while (position.line < document.lineCount) {
			position = this.resolveExplicitRange(document, foldingRanges, this.mainRegex, stack, position.line, position.offset);
		}

		this.doEOF(document, foldingRanges, stack);
		this.resolveIndentationRange(document, foldingRanges);

		return foldingRanges;
	}

	private addRegex(groupContext: GroupContext): string {
		const ruleIndex = this.rules.length;

		let begin = new RegExp(translate("^::", Flavor.ES2018));

		return this.addDocstringRegex(ruleIndex, begin, groupContext);
	}

	private addDocstringRegex(ruleIndex: number, begin: RegExp, groupContext: GroupContext): string {
		groupContext.index += this.getCaptureGroupCount(begin.source);

		const rule = {
			index: ruleIndex,
			begin,
		};

		this.rules.push(rule);

		return `(?<_${Marker.DOCSTRING}_${ruleIndex}>${rule.begin.source})`;
	}

	private doEOF(document: TextDocument, foldingRanges: FoldingRange[], stack: StackItem[]): void {
		const end = document.lineCount;
		while (stack[0]) {
			// Fold to End of File
			const begin = stack[0].line;

			if (end > begin + 1) {
				this.pushNewRange(begin, end, foldingRanges);
			}

			stack.shift();
		}
	}

	private * findOfRegexp(regex: RegExp, line: string, offset: number): Generator < {
		type: number;index: number;match: RegExpExecArray;nextOffset: number
	} > {
		// reset regex
		regex.lastIndex = offset;

		while (true) {
			const match = regex.exec(line) as RegExpExecArray | undefined;

			if (match?.groups) {
				const index = match.index ?? 0;
				if (index < offset) {
					continue;
				}

				const nextOffset = index + (match[0].length === 0 ? 1 : match[0].length);

				for (const key in match.groups) {
					if (match.groups[key] !== undefined) {
						const keys = key.split('_').map((x) => Number.parseInt(x, 10));

						yield {
							type: keys[1],
							index: keys[2],
							match,
							nextOffset,
						};

						break;
					}
				}

				regex.lastIndex = nextOffset;
			} else {
				break;
			}
		}
	}

	private getCaptureGroupCount(regex: string): number {
		const ast = parse(regex);

		let count = 0;

		visit(ast.body, {
			[TokenType.CAPTURE_GROUP]() {
				++count;
			},
		});

		return count;
	}

	private pushNewRange(begin: number, end: number, foldingRanges: FoldingRange[]): void {
		// LEAH: If you want to leave an extra line after the folding, set `end` to `end - 2`.
		foldingRanges.push(new FoldingRange(begin, end - 1, FoldingRangeKind.Region));
	}

	private resolveExplicitRange(document: TextDocument, foldingRanges: FoldingRange[], regexp: RegExp, stack: StackItem[], line: number, offset: number): Position {

		const text = document.lineAt(line).text;
		
		for (const {type, index} of this.findOfRegexp(regexp, text, offset)) {

			let rule = this.rules[index];

			switch (type) {
				case Marker.DOCSTRING:
					if (stack.length > 0 && stack[0].rule === rule) {
						const begin = stack[0].line;

						if (line >= begin) {
							this.pushNewRange(begin, line, foldingRanges);
							// LEAH: This was the line that I needed an extra day to bug fix.
							line = line - 1;
						}
						
						stack.shift();

					} else if (stack.length === 0) {
						stack.unshift({
							rule,
							line,
						});
					}

					break;
			}
		}

		return {
			line: line + 1,
			offset: 0
		};
	}

	private resolveIndentationRange(document: TextDocument, foldingRanges: FoldingRange[]): void {
		const tabSize = window.activeTextEditor ? Number.parseInt(`${window.activeTextEditor.options.tabSize ?? 4}`, 10) : 4;


		const existingRanges: Record < string, boolean > = {};
		for (const range of foldingRanges) {
			existingRanges[range.start] = true;
		}

		const previousRegions: PreviousRegion[] = [{
			indent: -1,
			begin: document.lineCount,
			end: document.lineCount
		}];

		for (let line = document.lineCount - 1; line >= 0; line--) {
			const lineContent = document.lineAt(line).text;
			const indent = computeIndentLevel(lineContent, tabSize);


			let previous = previousRegions[previousRegions.length - 1];

			if (indent === -1) {

				// for offSide languages, empty lines are associated to the previous block
				// note: the next block is already written to the results, so this only
				// impacts the end position of the block before
				previous.end = line;

				continue; // only whitespace
			}

			if (previous.indent > indent) {
				// discard all regions with larger indent
				do {
					previousRegions.pop();
					previous = previousRegions[previousRegions.length - 1];
				}
				while (previous.indent > indent);


				const endLineNumber = previous.end - 1;
				const block = endLineNumber - line >= 1;

				if (block && !existingRanges[line]) {
					foldingRanges.push(new FoldingRange(line, endLineNumber, FoldingRangeKind.Region));
				}

				previousRegions.push({
					indent,
					begin: line,
					end: line
				});
			} else if (previous.indent === indent) {
				previous.end = line;
			} else {
				previousRegions.push({
					indent,
					begin: line,
					end: line
				});
			}
		}
	}
}

export function activateFolding(context: vscode.ExtensionContext): ExplicitFoldingHub {
	$context = context;

	setupProviders();

	return $hub;
}