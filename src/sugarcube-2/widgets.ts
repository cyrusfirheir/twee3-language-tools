import * as vscode from 'vscode';

import { Passage } from '../passage';
import { normalizePath } from '../utils';
import type { macroDef, MacroName } from './macros';

export interface CollectedWidget {
	name: MacroName;
	container: boolean;
	passage: string;
	file: string;
}

export type WidgetRecord = Record<MacroName, CollectedWidget>;

export const isWidgetCollectionEnabled = function (): boolean {
	return vscode.workspace.getConfiguration("twee3LanguageTools.sugarcube-2.features").get("widgetDefinitions", true);
};

/** `<<widget widgetName [container]>>`, the name quoted or not. */
const widgetDefinitionRegex = /<<widget\s+(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s>]+))([^>]*)>>/g;

const widgetNameRegex = /^[A-Za-z][\w-]*$/;

const WIDGET_TAG = "widget";

/**
 * Collects the widget definitions from the `widget` tagged passages of a
 * document. Runs after the passages have been parsed out of it.
 */
export const collectWidgets = function (text: string, passages: Passage[]): WidgetRecord {
	const widgets: WidgetRecord = Object.create(null);

	for (const passage of passages) {
		if (!passage.tags?.includes(WIDGET_TAG)) continue;

		const content = cleanWidgetText(passage.getContentFromText(text));

		widgetDefinitionRegex.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = widgetDefinitionRegex.exec(content)) !== null) {
			const name = match[1] ?? match[2] ?? match[3];
			if (!name || !widgetNameRegex.test(name)) continue;

			const container = /(?:^|\s)container(?:\s|$)/.test(match[4] ?? "");

			// Redefining an existing widget is an error in SugarCube, so the first one wins.
			if (!(name in widgets)) {
				widgets[name] = { name, container, passage: passage.name, file: passage.origin.full };
			}
		}
	}

	return widgets;
};

const widgetCleanList = [
	["/\\*", "\\*/"],
	["/%", "%/"],
	["<!--", "-->"],
	["{{3}", "}{3}"],
	["\"{3}", "\"{3}"],
	["<nowiki>", "</nowiki>"],
	["<script(?:\\s+(?:(?:Twine)|(?:Java))Script)?>", "</script>"],
	["<style>", "</style>"],
	["/\\*\\s*@t3lt-parse-off\\s*\\*/", "/\\*\\s*@t3lt-parse-on\\s*\\*/"]
].map(el => new RegExp(`(${el[0]})((?:.|\r?\n)*?)(${el[1]})`, "gmi"));

/** Hides the `<<widget>>`s which are not definitions, as `collectUncached` does for macros. */
const cleanWidgetText = function (text: string): string {
	let cleaned = text;
	widgetCleanList.forEach(regex => {
		cleaned = cleaned.replace(regex, (_match, p1, p2, p3) => p1 + p2.replace(/<</g, "MO") + p3);
	});
	return cleaned;
};

/// Keyed by normalized path, as passages are.
const widgetCache: Map<string, WidgetRecord> = new Map();

const isSameWidget = function (left: CollectedWidget, right: CollectedWidget): boolean {
	return left.container === right.container && left.passage === right.passage && left.file === right.file;
};

const areSameWidgets = function (left: WidgetRecord | undefined, right: WidgetRecord): boolean {
	if (!left) return Object.keys(right).length === 0;

	const leftNames = Object.keys(left);
	if (leftNames.length !== Object.keys(right).length) return false;

	return leftNames.every(name => name in right && isSameWidget(left[name], right[name]));
};

/**
 * Records the widgets of a file.
 * @returns whether the widgets of the workspace changed.
 */
export const setFileWidgets = function (filePath: string, widgets: WidgetRecord): boolean {
	const path = normalizePath(filePath);

	if (areSameWidgets(widgetCache.get(path), widgets)) return false;

	if (Object.keys(widgets).length) widgetCache.set(path, widgets);
	else widgetCache.delete(path);

	return true;
};

/**
 * Forgets the widgets of a file, for when it is deleted or renamed.
 * @returns whether the widgets of the workspace changed.
 */
export const clearFileWidgets = function (filePath: string): boolean {
	return widgetCache.delete(normalizePath(filePath));
};

export const clearWidgets = function (): void {
	widgetCache.clear();
};

const widgetDescription = function (widget: CollectedWidget): vscode.MarkdownString {
	const fileName = widget.file.split("/").pop() || widget.file;
	const description = new vscode.MarkdownString(
		`Widget defined in the \`${widget.passage}\` passage of \`${fileName}\`.` +
		(widget.container ? `\n\nUsage:\n\n\`\`\`\n<<${widget.name}>> … <</${widget.name}>>\n\`\`\`` : "")
	);
	description.isTrusted = false;
	return description;
};

/**
 * The collected widgets as macro definitions. Arguments are left unvalidated,
 * since what a widget takes out of `_args` cannot be known from its definition.
 */
export const getWidgetMacros = function (): Record<MacroName, macroDef> {
	const macros: Record<MacroName, macroDef> = Object.create(null);

	for (const widgets of widgetCache.values()) {
		for (const name in widgets) {
			if (name in macros) continue;

			const widget = widgets[name];
			macros[name] = {
				name,
				container: widget.container,
				description: widgetDescription(widget),
			};
		}
	}

	return macros;
};
