import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult
} from 'vscode-languageserver';

import headsplit from "./headsplit";

const { v4: uuidv4 } = require('uuid');

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

let connection = createConnection(ProposedFeatures.all);

let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;

	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: {
				resolveProvider: true
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

interface ExampleSettings {
	maxNumberOfProblems: number;
}

const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}

	documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'twee3LanguageTools'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	let settings = await getDocumentSettings(textDocument.uri);

	let diagnostics: Diagnostic[] = [];
	const raw = textDocument.getText();
    let lines = raw.split(/\r?\n/g);
    lines.forEach((line, i) => {
		if (line.startsWith("::") && !line[2].match(/\s/)) {
			diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: i, character: 0},
                    end: { line: i, character: 3 }
				},
				message: `\nNo space between Start token (::) and passage name.\n\nIf this is a CSS pseudo selector, add a Universal selector (*), or at least one whitespace before (::)\n\n`,
                source: 'Style guide'
            });
		}
		if (line.match(/^::\s*StoryData\b/gm)) {
			const storydata = headsplit(raw, /^::(.*)/).find(el => el.header === "StoryData");
			if (storydata?.content) {
				try {
					JSON.parse(storydata.content);
				} catch (ex) {
					diagnostics.push({
						severity: DiagnosticSeverity.Error,
						range: {
							start: { line: i, character: 0},
							end: { line: i + storydata.content.split("\n").length + 1, character: 0 }
						},
						message: `\nMalformed StoryData JSON!\n\n${ex}\n\n`,
						source: 'ex'
					});
				}
			}
		}
	});
	
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	connection.console.log('We received an file change event');
});

connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		return [
			{
				label: "StoryData",
				data: "StoryData"
			}
		];
	}
);

connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		const completions: any = {
			"StoryData": {
				label: `:: StoryData\n` +
				`{\n\t` +
					`"ifid": "${uuidv4().toUpperCase()}",\n\t` +
					`"format": "",\n\t` +
					`"format-version": "",\n\t` +
					`"start": ""\n` +
				`}`,
				data: "StoryData",
				detail: "StoryData JSON chunk",
				documentation: "\nInserts JSON chunk for StoryData special passage along with a generated IFID.\n\n"
			}
		};
		
		return completions[item.data];
	}
);

documents.listen(connection);

connection.listen();
