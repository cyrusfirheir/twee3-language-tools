import * as vscode from 'vscode';

interface jsdocParsed {
    name: string;
    alias: string[];
    kind: string[];
    params: Object[];
    returns: Object[];
    description: string;
};

export const createSnippet = function (target: jsdocParsed) {
    let r = `<<${target.name}`;
    for(let i = 0; i < (target.params?.length || 0); i++) {
        r += " $" + i + 1;
    }
    r += `>>`;
    r += target.kind.includes("container") ? `\n\t$0\n<</${target.name}>>` : "";
    return r;
};

const createSnippetDocs = function (target: jsdocParsed) {
    let r = "";
    r += target.description ? `${target.description}  \n\n` : "";
    r += target.alias ? `*Names:* \`${target.name} | ${target.alias.join(" | ")}\`  \n\n` : "";
    target.params.forEach((el: any) => {
        r += " - ";
        r += el.name ? `${el.name} ` : "";
        r += el.type ? `\`${el.type.split("|").join(" | ")}\` ` : "";
        r += el.optional ? `\`optional\` ` : "";
        r += el.default ? `(Default: ${el.default}) ` : "";
        r += el.description ? `  \n\t ${el.description}` : "";
        r += "  \n\n";
    });
    r += target.returns.length > 0 ? "Returns:  \n" : "";
    target.returns.forEach((el: any) => {
        r += " - ";
        r += el.type ? `\`${el.type.split("|").join(" | ")}\` ` : "";
        r += el.description ? `  \n\t ${el.description}` : "";
        r += "  \n\n";
    });
    return r;
};

export const completion = function (context: vscode.ExtensionContext) {
    let r: vscode.CompletionItem[] = [];
    const docs: jsdocParsed[] = Object.values(context.workspaceState.get("jsdocs", {}));

    docs.forEach((el: jsdocParsed) => {
        const names = [el.name].concat(el.alias || []);

        names.forEach(elem => {
            const snippet = new vscode.CompletionItem(elem, vscode.CompletionItemKind.Method);
            snippet.insertText = new vscode.SnippetString(createSnippet(el));
            snippet.documentation = new vscode.MarkdownString(createSnippetDocs(el));
            snippet.detail = el.kind.join(" | ") || "";

            r.push(snippet);
        });
    });
    return r;
};