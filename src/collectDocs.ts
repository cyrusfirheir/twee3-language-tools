import * as vscode from 'vscode';
const jsdoc = require('jsdoc-api');

interface jsdocParsed {
    comment: string;
    name: string;
    alias?: string;
    description?: string;
    kind?: string;
    params?: Array<Object>;
    returns?: Array<Object>;
};

export const collectDocumentation = function (context: vscode.ExtensionContext, document: vscode.TextDocument) {
    const old = context.workspaceState.get("jsdocs", {});

    let docs: any = {};
    document.getText().match(/\/\*\*[\w\W]*?\*\//g)?.forEach(el => {
        const _parsed: jsdocParsed = jsdoc.explainSync({ source: el })[0];
        docs[_parsed.name] = _parsed;
    });

    return context.workspaceState.update("jsdocs", Object.assign(old, docs));
};