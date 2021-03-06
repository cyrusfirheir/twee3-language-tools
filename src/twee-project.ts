import * as vscode from "vscode";
import { validate } from "uuid";
import headsplit from "./headsplit";

export const storyDataPassageHeaderRegex = /^::\s*StoryData\b/gm;
export const storyDataPassageNameRegex = /StoryData\b.*/;

export function tweeProjectConfig(ctx: vscode.ExtensionContext, document: vscode.TextDocument) {
	const raw = document.getText();
	if (!storyDataPassageHeaderRegex.test(raw)) return;
	const storydataPassage = headsplit(raw, /^::(.*)/).find(el => storyDataPassageNameRegex.test(el.header));
	if (!storydataPassage?.content) return;
	let storydata: any = undefined;
	try {
		storydata = JSON.parse(storydataPassage.content);
		
		const errors: string[] = [];

		if (!storydata.ifid) errors.push("IFID not found!");
		else if (!validate(storydata.ifid)) errors.push("Invalid IFID!");

		const storyDataErrorConfig = vscode.workspace.getConfiguration("twee3LanguageTools.twee-3.error.storyData");

		if (!storydata.format && storyDataErrorConfig.get("format")) errors.push("Story Format name not found!");
		if (!storydata["format-version"] && storyDataErrorConfig.get("formatVersion")) errors.push("Story Format version not found!");

		if (errors.length) throw errors;

		ctx.workspaceState.update("StoryData", storydata);
	} catch (errors) {
		if (errors instanceof Array) errors.forEach((err: string) => vscode.window.showErrorMessage("Malformed StoryData: " + err));
		else vscode.window.showErrorMessage("Malformed StoryData JSON: " + errors.message);
		return;
	}
	let format = storydata.format.toLowerCase() + "-" + storydata["format-version"].split(".")[0];

	/* SC v3 - v2 alias hook */
	if (format === "sugarcube-3") format = "sugarcube-2";
	/* will be removed when v2 doesn't work for v3 anymore (>_<) */

	if (vscode.workspace.asRelativePath(document.uri) !== document.uri.fsPath) {
		/* file is inside the workspace */
		const config = vscode.workspace.getConfiguration("twee3LanguageTools.storyformat");
		if (config.get("current") !== format) {
			config.update("current", format)
				.then(() => vscode.window.showInformationMessage("Storyformat set to " + format));
		}
	}
};

export async function changeStoryFormat(document: vscode.TextDocument) {
	let format: string = "";
	const config = vscode.workspace.getConfiguration("twee3LanguageTools.storyformat");
	const override = config.get("override") || "";
	if (!override) format = "twee3-" + config.get("current");
	else format = "twee3-" + override;
	const langs = await vscode.languages.getLanguages();
	if (!langs.includes(format)) format = "twee3";
	if (
		/^twee3.*/.test(document.languageId) &&
		document.languageId !== format
	) return vscode.languages.setTextDocumentLanguage(document, format);
	else return new Promise(res => res(document));
};