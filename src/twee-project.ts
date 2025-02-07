import * as vscode from "vscode";
import { validate } from "uuid";
import { getWorkspacePassages } from "./passage";
import { log } from "./extension";

export interface StoryData {
	ifid: string;
	format: string;
	"format-version": string;
}

export const storyDataPassageHeaderRegex = /^::\s*StoryData\b/gm;
export const storyDataPassageNameRegex = /StoryData\b.*/;

export async function tweeProjectConfig(context: vscode.ExtensionContext) {
	const passages = getWorkspacePassages(context);
	const storyDataPassage = passages.find(p => p.name === "StoryData");
	
	if (storyDataPassage) {
		let data: StoryData;
		try {
			data = JSON.parse(await storyDataPassage.getContent());

			const errors: string[] = [];

			const storyDataErrorConfig = vscode.workspace.getConfiguration("twee3LanguageTools.twee-3.error.storyData");
			
			if (storyDataErrorConfig.get("ifid")) {
				if (!data.ifid) errors.push("IFID not found!");
				else if (!validate(data.ifid)) errors.push("Invalid IFID!");
			}

			if (!data.format && storyDataErrorConfig.get("format")) errors.push("Story Format name not found!");
			if (!data["format-version"] && storyDataErrorConfig.get("formatVersion")) errors.push("Story Format version not found!");

			if (errors.length) throw errors;

			context.workspaceState.update("StoryData", data);
		} catch (errors) {
			if (errors instanceof Array) errors.forEach((err: string) => vscode.window.showErrorMessage("Malformed StoryData: " + err));
			else vscode.window.showErrorMessage("Malformed StoryData JSON: " + (errors as Error).message);
	
			return;
		}

		let format = data.format.toLowerCase() + "-" + data["format-version"].split(".")[0];

		/* SC v3 - v2 alias hook */
		if (format === "sugarcube-3") format = "sugarcube-2";
		/* will be removed when v2 doesn't work for v3 anymore (>_<) */

		const config = vscode.workspace.getConfiguration("twee3LanguageTools.storyformat");
		if (config.get("current") !== format) {
			await config.update("current", format);
			const formatMessage = `Storyformat set to ${format}`;
			log.info(formatMessage);
			vscode.window.showInformationMessage(formatMessage);
		}
	}
};

export async function changeStoryFormat(document: vscode.TextDocument): Promise<vscode.TextDocument> {
	const config = vscode.workspace.getConfiguration("twee3LanguageTools.storyformat");
	const langs = await vscode.languages.getLanguages();

	let format = "twee3-" + (config.get("override") || config.get("current"));

	if (!langs.includes(format)) format = "twee3";

	if (/^twee3.*/.test(document.languageId) && document.languageId !== format) {
		return vscode.languages.setTextDocumentLanguage(document, format);
	}
	return Promise.resolve(document);
};