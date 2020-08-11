import * as fs from 'fs';
import * as vscode from 'vscode';
import { URL } from 'url';
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

export const collectDocumentation = function (raw: string) {
    const ws = vscode.workspace.workspaceFolders?.[0].uri.path;
    if (ws) {
        const wsURL = new URL("file://" + ws + "/.vscode/.t3lt_temp.json");
        let docs: any = {};
        raw.match(/\/\*\*[\w\W]*?\*\//g)?.forEach(el => {
            const _parsed: jsdocParsed = jsdoc.explainSync({ source: el })[0];
            docs[_parsed.name] = _parsed;
        });
        const old = JSON.parse(fs.readFileSync(wsURL, "utf8"));
        fs.writeFileSync(wsURL, JSON.stringify(Object.assign(old, docs)), "utf8");
    }
};