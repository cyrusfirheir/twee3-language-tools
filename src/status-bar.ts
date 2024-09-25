import * as vscode from "vscode";
import { Passage } from "./passage";
import * as sugarcube2Language from "./sugarcube-2/configuration";

export function passageCounter(ctx: vscode.ExtensionContext, StatusBarItem?: vscode.StatusBarItem) {
	const passages = ctx.workspaceState.get("passages", []) as Passage[];
	let specCount = 0;
	for (let i = 0; i < passages.length; i++) {
		if (passages[i].tags?.includes("script") || passages[i].tags?.includes("stylesheet") || ["PassageDone", "PassageFooter", "PassageHeader", "PassageReady", "StoryAuthor", "StoryBanner", "StoryCaption", "StoryDisplayTitle", "StoryInit", "StoryInterface", "StoryMenu", "StorySettings", "StoryShare", "StorySubtitle", "StoryTitle", "StoryData",].includes(passages[i].name)) {
			specCount++;
		}
	};
	if (!StatusBarItem) {
		StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	};
	StatusBarItem.text = `Passage Count: ${passages.length}`;
	StatusBarItem.tooltip = `Total Number of Passages in Twee files: ${passages.length}\nNumber of Story Passages: ${passages.length - specCount}\nClick to open Story Map`;
	StatusBarItem.command = "twee3LanguageTools.passageCounter.clickCheck"
	if (passages.length != 0) {
		StatusBarItem.show();
	} else {
		StatusBarItem.hide();
	}
	return StatusBarItem;
};

export async function wordCounter(ctx: vscode.ExtensionContext, StatusBarItem?: vscode.StatusBarItem) {
    const languageId = vscode.window.activeTextEditor?.document.languageId;
    
    const rawPassages: any[] = ctx.workspaceState.get("passages", []); // Retrieve as plain objects
    let wordCount = 0;
    let macroCount = 0;

    const commentRegex = /\/%.*?%\/|\/\*.*?\*\/|<!--.*?-->/gs;
    const htmlTagRegex = /<[^>]+>/g;
    const macroRegex = /<<([^>]+)>>/g;
    const quoteRegex = /["']([^"']+)["']/g;
    const wordRegex = /[a-zA-Z0-9]+(?:[-–—'’][a-zA-Z0-9]+)*/g;
    
    function countWords(text: string): number {
        text = text.replace(/<<.*?>>/gs, ''); // Remove macros
        text = text.replace(/\[[^\]]*\]/g, ''); // Remove content inside [] because Link/Text/Setter is low volume
        text = text.replace(commentRegex, ''); // Remove comments
        text = text.replace(htmlTagRegex, ' '); // Remove HTML tags
        text = text.replace(/\s+/g, ' ').trim(); // Normalize spaces
    
        const words = text.match(wordRegex) || [];
        return words.length;
    }

    function countMacro(text: string): number {
        let totalWordCount = 0;
        let match;

        while ((match = macroRegex.exec(text)) !== null) {
            const macroContent = match[1];
            const quotedWords = macroContent.match(quoteRegex);
            
            if (quotedWords) {
                for (const quote of quotedWords) {
                    const wordString = quote.slice(1, -1);
                    const words = wordString.split(/\s+/).filter(word => word.length > 0);
                    totalWordCount += words.length;
                }
            }
        }

        return totalWordCount;
    }

    function genericCountWords(text: string): number {
        text = text.normalize('NFKD');
        text = text.replace(/\n/g, '');
        const commentRegex = /\/%.*?%\/|\/\*.*?\*\/|<!--.*?-->/gs;
        text = text.replace(commentRegex, '');

        let charCount = 0;
    
        for (const char of text) {
            if (char.trim()) {
                charCount++;
            }
        }
    
        let words = Math.floor(charCount / 5);
        if (charCount % 5 > 0) {
            words++;
        }
    
        return words;
    }

    await Promise.all(rawPassages.map(async (rawPassage) => {
        const passage = new Passage(
            rawPassage.name,
            rawPassage.range,
            rawPassage.stringRange,
            rawPassage.origin,
            rawPassage.collapsibleState,
            rawPassage.tags,
            rawPassage.meta
        );

        if (
            passage.tags?.includes("script") || 
            passage.tags?.includes("stylesheet") ||
            passage.tags?.includes("init") || 
            [
                "PassageDone", "PassageReady", "StoryAuthor", 
                "StoryInit", "StoryInterface", "StoryMenu", 
                "StorySettings", "StoryShare", "StoryData"
            ].includes(passage.name)
        ) {
            return;
        }

        const passageText = await passage.getContent();

        if (languageId === sugarcube2Language.LanguageID) {
            wordCount += countWords(passageText);
            macroCount += countMacro(passageText);
        } else {
            wordCount += genericCountWords(passageText);
        }
        
    }));

    if (!StatusBarItem) {
        StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    }

    if (languageId === sugarcube2Language.LanguageID) {
        StatusBarItem.text = `Word Count: ${wordCount}, Macro Word Count: ${macroCount}`;
        StatusBarItem.tooltip = `Total words in Twee files: ${wordCount}\nTotal words inside macro(s) in Twee files: ${macroCount}`;
    } else {
        StatusBarItem.text = `Word Count: ${wordCount}`;
        StatusBarItem.tooltip = `Total words in Twee files: ${wordCount}`;
    }

    if (wordCount > 0 || macroCount > 0) {
        StatusBarItem.show();
    } else {
        StatusBarItem.hide();
    }

    return StatusBarItem;
}

export async function sbStoryMapConfirmationDialog() {
	const settings = vscode.workspace.getConfiguration("twee3LanguageTools.passageCounter");
	const confirmation = settings.get("openStoryMapWithoutConfirmation");
	if (confirmation) {
		vscode.commands.executeCommand("twee3LanguageTools.storyMap.show");
	} else {
		const answer = await vscode.window.showInformationMessage(
			"Would you like to open the Story Map?\n(Opens in default external browser)",
			{ modal: true },
			"Open This Time", "Always Open"
		);
		switch (answer) {
			case "Always Open": settings.update("openStoryMapWithoutConfirmation", true);
			case "Open This Time": vscode.commands.executeCommand("twee3LanguageTools.storyMap.show");
		}
	}
}