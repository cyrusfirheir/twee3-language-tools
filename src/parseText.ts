import { TextDocument, ExtensionContext, ThemeIcon, workspace } from 'vscode';
import { Passage, PassageListProvider } from './tree-view';

interface IParsedToken {
	line: number;
	startCharacter: number;
	length: number;
	tokenType: string;
	tokenModifiers: string[];
}

export const parseText = async function (context: ExtensionContext, document: TextDocument, provider?: PassageListProvider): Promise<IParsedToken[]> {
    let passages: Passage[] = [];
    if (workspace.getConfiguration("twee3LanguageTools.passage").get("list")) {
        const old: Passage[] = context.workspaceState.get("passages", []);
        passages = Array.from(old).filter(el => el.__origin__ !== document.uri.path);
    }
    const r: IParsedToken[] = [];
    const lines = document.getText().split(/\r?\n/);
    lines.forEach((line, i) => {
        if (line.startsWith("::")) {
            const escaped = line.replace(/\\./g, "ec"); // escaped characters

            const oTag = escaped.indexOf("[");
            const cTag = escaped.indexOf("]");
            const oMeta = escaped.indexOf("{");
            const cMeta = escaped.indexOf("}");
            const tag = cTag > oTag;
            const meta = cMeta > oMeta;

            const nameLength = oTag > 0
                ? oMeta > 0
                    ? oMeta > oTag
                        ? oTag - 2
                        : oMeta - 2
                    : oTag - 2
                : oMeta > 0
                    ? oMeta - 2
                    : line.length;

            if (!(
                escaped.substring(2, 2 + nameLength).match(/[}\]]/g) ||
                escaped.split("[").length - 1 > 1 ||
                escaped.split("{").length - 1 > 1 ||
                oTag > 0 && !tag ||
                oMeta > 0 && !meta ||
                oMeta > 0 && oMeta < oTag
            )) {
                let passageName, specialName, passageTags, specialTag, passageMeta;

                passageName = line.substring(2, 2 + nameLength).trim();
                specialName = [
                    "StoryTitle",
                    "StoryData",
                    "Start"
                ].includes(passageName);

                

                r.push({
                    line: i, startCharacter: 0, length: 2, tokenType: "startToken", tokenModifiers: []
                }, {
                    line: i, startCharacter: 2, length: nameLength,
                    tokenType: specialName ? "special" : "passageName",
                    tokenModifiers: []
                });

                if (oTag > 0) {
                    passageTags = line.substring(oTag + 1, cTag).trim();
                    specialTag = [
                        "script",
                        "stylesheet"
                    ].includes(passageTags);

                    r.push({
                        line: i, startCharacter: oTag, length: 1, tokenType: "comment", tokenModifiers: []
                    }, {
                        line: i, startCharacter: oTag + 1, length: cTag - oTag - 1,
                        tokenType: specialTag ? "special" : "passageTags",
                        tokenModifiers: []
                    }, {
                        line: i, startCharacter: cTag, length: 1, tokenType: "comment", tokenModifiers: []
                    });
                }

                if (oMeta > 0) {
                    passageMeta = line.substring(oMeta, cMeta + 1);
                    r.push({
                        line: i, startCharacter: oMeta, length: 1, tokenType: "comment", tokenModifiers: []
                    }, {
                        line: i, startCharacter: oMeta + 1, length: cMeta - oMeta - 1, tokenType: "passageMeta", tokenModifiers: []
                    }, {
                        line: i, startCharacter: cMeta, length: 1, tokenType: "comment", tokenModifiers: []
                    });
                }

                if (workspace.getConfiguration("twee3LanguageTools.passage").get("list")) {
                    let passage = new Passage(document.uri.path, passageName);

                    passage.tags = passageTags?.split(" ");
                    passage.description = passage.tags?.join(", ") || "";

                    passage.meta = passageMeta || "";

                    if (specialName) switch (passageName) {
                        case "Start": passage.iconPath = new ThemeIcon("rocket"); break;
                        case "StoryTitle": passage.iconPath = new ThemeIcon("mention"); break;
                        case "StoryData": passage.iconPath = new ThemeIcon("json"); break;
                    }
                    else if (specialTag) switch (passage.tags?.[0]) {
                        case "script": passage.iconPath = new ThemeIcon("code"); break;
                        case "stylesheet": passage.iconPath = new ThemeIcon("paintcan"); break;
                    }

                    passages.push(passage);
                }
            }
        }
    });
    if (workspace.getConfiguration("twee3LanguageTools.passage").get("list")) await context.workspaceState.update("passages", passages);
    provider?.refresh();
    return Promise.resolve(r);
}