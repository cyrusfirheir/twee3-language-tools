import * as vscode from "vscode";
import headsplit from "./headsplit";

export const storyDataPassageHeaderRegex = /^::\s*StoryData\b/gm;
export const storyDataPassageNameRegex = /StoryData\b.*/;

export function tweeProjectConfig(document: vscode.TextDocument) {
	const raw = document.getText();
	if (!storyDataPassageHeaderRegex.test(raw)) return;
	const storydata = headsplit(raw, /^::(.*)/).find(el => storyDataPassageNameRegex.test(el.header));
	if (!storydata?.content) return;
	let formatInfo: any = undefined;
	try {
		formatInfo = JSON.parse(storydata.content);
		if (!formatInfo.format) throw new Error("Format name not found!");
		if (!formatInfo["format-version"]) throw new Error("Format version not found!");
	} catch (ex) {
		vscode.window.showErrorMessage("Malformed StoryData JSON! - " + ex);
		return;
	}
	let format = formatInfo.format.toLowerCase() + "-" + formatInfo["format-version"].split(".")[0];

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