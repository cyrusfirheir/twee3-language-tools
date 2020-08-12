interface IParsedToken {
	line: number;
	startCharacter: number;
	length: number;
	tokenType: string;
	tokenModifiers: string[];
}

export const parseText = function (text: string): IParsedToken[] {
    const r: IParsedToken[] = [];
    const lines = text.split(/\r?\n/);
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
                const passageName = line.substring(2, 2 + nameLength).trim();
                const specialName = [
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
                    const passageTags = line.substring(oTag + 1, cTag).trim();
                    const specialTag = [
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
                    r.push({
                        line: i, startCharacter: oMeta, length: 1, tokenType: "comment", tokenModifiers: []
                    }, {
                        line: i, startCharacter: oMeta + 1, length: cMeta - oMeta - 1, tokenType: "passageMeta", tokenModifiers: []
                    }, {
                        line: i, startCharacter: cMeta, length: 1, tokenType: "comment", tokenModifiers: []
                    });
                }
            }
        }
    });
    return r;
}