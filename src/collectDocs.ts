import * as vscode from 'vscode';
import * as cp from 'comment-parser';

interface jsdocParsed {
    name: string;
    alias: string[];
    kind: string[];
    params: Object[];
    returns: Object[];
    description: string;
};

export const collectDocumentation = function (context: vscode.ExtensionContext, document: vscode.TextDocument) {
    const old = context.workspaceState.get("jsdocs", {});

    let docs: any = {};
    document.getText().match(/\/\*\*[\w\W]*?\*\//g)?.forEach(el => {
        const _parsed = cp(el)[0];
        let newDoc: jsdocParsed = {
            name: "",
            alias: [],
            kind: [],
            params: [],
            returns: [],
            description: _parsed.description
        };
        _parsed.tags.forEach((elem, i) => {
            switch (elem.tag) {
                case "desc": case "description": {
                    newDoc.description = elem.source.replace(/^@desc(ription)?\s/, "").trim();
                    break;
                }
                case "name": {
                    newDoc.name = elem.name;
                    break;
                }
                case "alias": {
                    newDoc.alias.push(elem.name);
                    break;
                }
                case "kind": {
                    newDoc.kind = elem.source.replace(/^@kind\s/, "").trim().split(" ");
                    break;
                }
                case "arg": case "argument": case "param": {
                    newDoc.params.push(elem);
                    break;
                }
                case "return": case "returns": {
                    newDoc.returns.push(elem);
                    break;
                }
            }
        });
        if (newDoc.name) docs[newDoc.name] = newDoc;
    });

    return context.workspaceState.update("jsdocs", Object.assign(old, docs));
};