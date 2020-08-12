import * as vscode from 'vscode';

interface jsdocParsed {
    comment: string;
    name: string;
    alias?: string;
    description?: string;
    kind?: string;
    params?: Array<Object>;
    returns?: Array<Object>;
};

export const createSnippet = function (target: jsdocParsed) {
    const kind = target.kind || "macro";
    let r = `<<${target.name}`;
    for(let i = 0; i < (target.params?.length || 0); i++) {
        r += " $" + i + 1;
    }
    r += `>>`;
    r += kind.includes("container") ? `\n\t$0\n<</${target.name}>>` : "";
    return r;
};

const createSnippetDocs = function (target: jsdocParsed) {
    let r = "";
    r += target.description ? `${target.description}  \n\n` : "";
    r += target.alias ? `*Names:* \`${target.name} | ${target.alias.split(" ").join(" | ")}\`  \n\n` : "";
    target.params?.forEach((el: any) => {
        r += " - ";
        r += el.name ? `${el.name} ` : "";
        r += el.type ? `\`${el.type.names.join(" | ")}\` ` : "";
        r += el.optional ? `\`optional\` ` : "";
        r += el.defaultvalue ? `(Default: ${el.defaultvalue}) ` : "";
        r += el.description ? `  \n\t ${el.description}` : "";
        r += "  \n\n";
    });
    r += target.returns ? "Returns:  \n" : "";
    target.returns?.forEach((el: any) => {
        r += " - ";
        r += el.type ? `\`${el.type.names.join(" | ")}\` ` : "";
        r += el.description ? `  \n\t ${el.description}` : "";
        r += "  \n\n";
    });
    return r;
};

export const completion = function (context: vscode.ExtensionContext) {
    let r: vscode.CompletionItem[] = [];
    const docs: jsdocParsed[] = Object.values(context.workspaceState.get("jsdocs", {}));

    docs.forEach((el: jsdocParsed) => {
        const names = [el.name].concat(el.alias?.split(" ") || []);

        names.forEach(elem => {
            const snippet = new vscode.CompletionItem(elem, vscode.CompletionItemKind.Method);
            snippet.insertText = new vscode.SnippetString(createSnippet(el));
            snippet.documentation = new vscode.MarkdownString(createSnippetDocs(el));
            snippet.detail = el.kind || "";

            r.push(snippet);
        });
    });
    return r;
};