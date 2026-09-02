const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

class Position {
	constructor(line, character) { this.line = line; this.character = character; }
	translate(line = 0, character = 0) { return new Position(this.line + line, this.character + character); }
	isEqual(other) { return this.line === other.line && this.character === other.character; }
}

class Range {
	constructor(a, b, c, d) {
		this.start = typeof a === 'number' ? new Position(a, b) : a;
		this.end = typeof a === 'number' ? new Position(c, d) : b;
	}
	toJSON() { return [this.start, this.end]; }
}

function document(text, scheme = 'file', version = 1, ref = 'index', filename = '/workspace/story.tw') {
	return {
		fileName: filename, version, languageId: 'twee3-sugarcube-2',
		uri: { scheme, path: filename, fsPath: filename, toString: () => scheme + ':' + filename + (scheme === 'git' ? '?ref=' + ref : '') },
		update(value) { text = value; this.version++; },
		getText(range) {
			if (!range) return text;
			const offset = position => {
				const lines = text.split('\n');
				if (position.line >= lines.length) return text.length;
				return lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0)
					+ Math.min(position.character, lines[position.line].length);
			};
			return text.slice(offset(range.start), offset(range.end));
		},
	};
}

function context() {
	const state = new Map();
	return { workspaceState: {
		get: (key, fallback) => state.has(key) ? state.get(key) : fallback,
		update: async (key, value) => { state.set(key, JSON.parse(JSON.stringify(value))); },
	} };
}

function loadExtension() {
	const definitions = {
		widget: { name: 'widget', container: true, parameters: ['text'] },
		set: { name: 'set', skipArgs: true },
	};
	const vscode = {
		Position, Range,
		TreeItem: class {}, ThemeIcon: class {}, ThemeColor: class {},
		SemanticTokensLegend: class {}, MarkdownString: class {},
		DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
		TreeItemCollapsibleState: { None: 0 },
		OverviewRulerLane: { Center: 2 },
		DecorationRangeBehavior: { ClosedClosed: 1 },
		workspace: {
			getWorkspaceFolder: () => ({ uri: { path: '/workspace' } }),
			getConfiguration(section) { return { get(key) {
				if (section === 'twee3LanguageTools.storyformat') return key === 'current' ? 'sugarcube-2' : '';
				if (section.includes('.experimental.') || section.endsWith('.cache')) return false;
				return true;
			} }; },
		},
		window: {
			createTextEditorDecorationType: () => ({ dispose() {} }),
			showErrorMessage: message => { throw new Error(message); },
		},
	};
	const root = path.resolve(__dirname, '../src');
	const modules = new Map();
	const configuration = {
		LanguageID: 'twee3-sugarcube-2',
		getConfiguration: async () => ({ macros: definitions, enums: {} }),
	};
	modules.set(path.join(root, 'sugarcube-2/configuration.ts'), { exports: configuration });
	modules.set(path.join(root, 'file-ops.ts'), { exports: {
		readFile: () => { throw new Error('Diagnostics must read the supplied document, not the filesystem'); },
	} });

	// Load the real parsers and caches; only the VS Code host and file/config I/O are mocked.
	function load(filename) {
		if (modules.has(filename)) return modules.get(filename).exports;
		const module = { exports: {} };
		modules.set(filename, module);
		const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
			fileName: filename,
		}).outputText;
		const importModule = name => {
			if (name === 'vscode') return vscode;
			if (!name.startsWith('.')) return require(name);
			const target = path.resolve(path.dirname(filename), name);
			return name.endsWith('.json') ? require(target) : load(target + '.ts');
		};
		const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', 'setInterval', output);
		evaluate(module.exports, importModule, module, filename, path.dirname(filename), (...args) => setInterval(...args).unref());
		return module.exports;
	}

	const macros = load(path.join(root, 'sugarcube-2/macros.ts'));
	macros.onUpdateMacroCache(undefined, definitions, {});
	return { macros, parser: load(path.join(root, 'parse-text.ts')), diagnostics: load(path.join(root, 'diagnostics.ts')) };
}

const originalText = ':: Demo [widget]\n<<widget "one">>\n<<set $x to 1>>\n<</widget>>\n<<widget "two">>\n<<set $x to 2>>\n<</widget>>\n:: StoryData\n{"ifid":"demo"}\n';
const changedText = originalText.replace('<<widget "two">>', '\n<<widget "two">>');

async function diagnose(extension, ctx, doc) {
	let result;
	await extension.diagnostics.updateDiagnostics(ctx, doc, { set(uri, diagnostics) {
		assert.equal(uri.toString(), doc.uri.toString());
		result = diagnostics;
	} });
	return result;
}

for (const first of ['file', 'git']) {
	for (const currentVersion of [1, 5]) {
		test(`blank-line insertion stays valid with ${first} first and worktree version ${currentVersion}`, async () => {
			const extension = loadExtension();
			const ctx = context();
			const current = document(changedText, 'file', currentVersion);
			const old = document(originalText, 'git');
			await extension.parser.parseText(ctx, current);
			const pair = first === 'file' ? [current, old] : [old, current];
			for (const doc of pair) assert.deepEqual(await diagnose(extension, ctx, doc), []);
		});
	}
}

test('Git semantic parsing and diagnostics do not replace workspace passages', async () => {
	const extension = loadExtension();
	const ctx = context();
	const current = document(changedText);
	const old = document(originalText, 'git');
	await extension.parser.parseText(ctx, current);
	const passagesBefore = JSON.stringify(ctx.workspaceState.get('passages'));
	assert.ok((await extension.parser.parseText(ctx, old)).length > 0);
	assert.equal(JSON.stringify(ctx.workspaceState.get('passages')), passagesBefore);
	assert.deepEqual(await diagnose(extension, ctx, old), []);
	assert.equal(JSON.stringify(ctx.workspaceState.get('passages')), passagesBefore);
	assert.deepEqual(await diagnose(extension, ctx, current), []);
});

test('snapshot passage callbacks still receive snapshot-local ranges', async () => {
	const extension = loadExtension();
	const ctx = context();
	await extension.parser.parseText(ctx, document(changedText));
	let passages;
	await extension.parser.parseText(ctx, document(originalText, 'git'), value => { passages = value; });
	assert.equal(passages.find(passage => passage.name === 'StoryData').range.start.line, 7);
});

for (const scheme of ['file', 'git']) {
	test(`real parameter and container errors remain visible in ${scheme} documents`, async () => {
		const extension = loadExtension();
		const ctx = context();
		const broken = document(':: Demo [widget]\n<<widget>>\n<</widget>>\n', scheme);
		const result = await diagnose(extension, ctx, broken);
		assert.ok(result.some(item => [108, 109].includes(item.code)));
		const unclosed = document(':: Demo [widget]\n<<widget "test">>\n', scheme);
		assert.ok((await diagnose(extension, ctx, unclosed)).some(item => item.code === 101));
	});
}

test('valid worktree and invalid Git snapshot do not share diagnostics', async () => {
	const extension = loadExtension();
	const ctx = context();
	const current = document(changedText);
	await extension.parser.parseText(ctx, current);
	assert.deepEqual(await diagnose(extension, ctx, current), []);
	const old = document(originalText.replace('<<widget "two">>', '<<widget>>'), 'git');
	assert.ok((await diagnose(extension, ctx, old)).some(item => [108, 109].includes(item.code)));
	assert.deepEqual(await diagnose(extension, ctx, current), []);
});

test('reopening the same URI with the same or a lower version reparses it', async () => {
	for (const version of [1, 5]) {
		const { macros } = loadExtension();
		const current = document(changedText, 'file', version);
		const cached = await macros.collectCache.get(current);
		const reopened = document(originalText, 'file', 1);
		const actual = await macros.collectCache.get(reopened);
		assert.notDeepEqual(actual, cached);
		const expected = await loadExtension().macros.collectCache.get(reopened);
		assert.deepEqual(actual, expected);
	}
});

test('unchanged documents reuse their promise and edits invalidate it', async () => {
	const { macros } = loadExtension();
	const doc = document(originalText);
	const cached = macros.collectCache.get(doc);
	assert.equal(macros.collectCache.get(doc), cached);
	doc.update(changedText);
	const updated = macros.collectCache.get(doc);
	assert.notEqual(updated, cached);
	assert.notDeepEqual(await updated, await cached);
});

test('closing one document releases only its own cache entry', async () => {
	const { macros } = loadExtension();
	const current = document(changedText);
	const old = document(originalText, 'git');
	const currentCached = macros.collectCache.get(current);
	const oldCached = macros.collectCache.get(old);
	macros.collectCache.clearDocument(old);
	assert.equal(macros.collectCache.get(current), currentCached);
	assert.notEqual(macros.collectCache.get(old), oldCached);
	const reopened = document(originalText);
	const reopenedCached = macros.collectCache.get(reopened);
	macros.collectCache.clearDocument(current);
	assert.equal(macros.collectCache.get(reopened), reopenedCached);
	await Promise.all([currentCached, oldCached, reopenedCached]);
});

test('HEAD, index and worktree have separate cache entries and filename cleanup clears all three', async () => {
	const { macros } = loadExtension();
	const docs = [document(changedText), document(originalText, 'git'), document(originalText, 'git', 1, 'HEAD')];
	const other = document(originalText, 'file', 1, '', '/workspace/other.tw');
	const otherCached = macros.collectCache.get(other);
	const cached = docs.map(doc => macros.collectCache.get(doc));
	assert.equal(new Set(cached).size, docs.length);
	macros.collectCache.clearFilename(docs[0].fileName);
	for (let i = 0; i < docs.length; i++) assert.notEqual(macros.collectCache.get(docs[i]), cached[i]);
	assert.equal(macros.collectCache.get(other), otherCached);
	await Promise.all([...cached, otherCached]);
});
