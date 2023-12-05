import * as vscode from "vscode";

export function headsplit(raw: string, regexp: RegExp, caps: number = 1) {
	const text = raw.trim().split(/\r?\n/);
	let retArr: { header: string; content: string }[] = [],
		_header = "",
		_content = "",
		_caps = "";
	for (let c = 0; c < caps; c++) {
		_caps += ("\$" + (c + 1) + ".____.");
	}
	_caps = _caps.slice(0, -6);
	for (let t = 0; t < text.length; t++) {
		if (regexp.test(text[t])) {
			retArr.push({
				header: _header.trim(),
				content: _content.trim()
			});
			_header = text[t].replace(regexp, _caps);
			_content = "";
		} else {
			_content += (text[t] + "\n");
		}
		if (t === (text.length - 1)) {
			retArr.push({
				header: _header.trim(),
				content: _content.trim()
			});
		}
	}
	retArr.shift();
	return retArr;
}

export function tabstring() {
	const editorConfig = vscode.workspace.getConfiguration("editor");
	return editorConfig.get("insertSpaces") ?? false
		? editorConfig.get("tabSize") as number ?? 4
		: "\t";
}