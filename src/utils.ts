import * as vscode from "vscode";

/**
 * Normalize a URI path for identity comparison.
 *
 * On Windows, file paths are case-insensitive but VS Code's various APIs
 * (globSync, Uri.file, onDidRenameFiles, setTextDocumentLanguage, FileSystemWatcher, ...)
 * do not agree on drive-letter casing. Two Uris pointing at the same file
 * can appear as `/D:/foo/bar.tw` and `/d:/foo/bar.tw`. Case-sensitive `===`
 * comparisons against `origin.full` / `document.uri.path` then silently miss,
 * producing duplicate passage records and lost-lookup filters that fuel the
 * high-CPU loop reported in https://github.com/cyrusfirheir/twee3-language-tools
 *
 * This normalizes the Windows drive letter to lowercase. On other platforms
 * it is a no-op since paths are case-sensitive there.
 */
export function normalizePath(p: string): string {
	if (process.platform === "win32") {
		return p.replace(/^(\/?)([a-zA-Z]):/, (_m, slash, letter) => slash + letter.toLowerCase() + ":");
	}
	return p;
}

export function pathsEqual(a: string, b: string): boolean {
	return normalizePath(a) === normalizePath(b);
}

export function uriPath(uri: vscode.Uri): string {
	return normalizePath(uri.path);
}

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