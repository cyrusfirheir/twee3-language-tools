import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	CompletionItemKind,
	InsertTextFormat
} from 'vscode-languageserver';
import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import headsplit from "./headsplit";
const { v4: uuidv4 } = require('uuid');

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

documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {

	let diagnostics: Diagnostic[] = [];
	const raw = textDocument.getText();
    let lines = raw.split(/\r?\n/g);
    lines.forEach((line, i) => {
		
		if (line.startsWith("::")) {
			const escaped = line.replace(/\\./g, "ec"); // escaped characters

			if (!line[2].match(/\s/)) {
				diagnostics.push({
					severity: DiagnosticSeverity.Warning,
					range: {
						start: { line: i, character: 0 },
						end: { line: i, character: 3 }
					},
					message: `\nNo space between Start token (::) and passage name.\n\n(If this is a CSS selector for a pseudo element, add a universal selector (*), or at least one whitespace before the start token.)\n\n`,
					source: 'Style guide',
					code: 0
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
								start: { line: i, character: 0 },
								end: { line: i + storydata.content.split("\n").length + 1, character: 0 }
							},
							message: `\nMalformed StoryData JSON!\n\n${ex}\n\n`,
							source: 'ex',
							code: 1
						});
					}
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
			{ label: "StoryData" }
		];
	}
);

connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		const completions: any = {
			"StoryData": {
				label: "StoryData",
				insertText: 
					`:: StoryData\n` +
					`{\n\t` +
						`"ifid": "${uuidv4().toUpperCase()}",\n\t` +
						`"format": "$1",\n\t` +
						`"format-version": "$2",\n\t` +
						`"start": "$3"\n` +
					`}`
				,
				insertTextFormat: InsertTextFormat.Snippet,
				kind: CompletionItemKind.Snippet,
				detail: "StoryData JSON chunk",
				documentation: "Inserts JSON chunk for StoryData special passage along with a generated IFID.\n\n"
			}
		};
		
		return completions[item.label];
	}
);

documents.listen(connection);

connection.listen();
