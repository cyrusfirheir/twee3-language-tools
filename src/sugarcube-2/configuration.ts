import * as vscode from 'vscode';
import * as yaml from 'yaml';
import * as macros from './macros';
import * as macroListCore from './macros.json';

const configFileWatcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher(
	"**/*.twee-config.{json,yaml,yml}",
	false,
	false,
	false,
);
configFileWatcher.onDidChange(async (e) => {
	await updateConfigurationCache();
	vscode.commands.executeCommand("twee3LanguageTools.refreshDiagnostics");
});
configFileWatcher.onDidCreate(async (e) => {
	await updateConfigurationCache();
	vscode.commands.executeCommand("twee3LanguageTools.refreshDiagnostics");
});
configFileWatcher.onDidDelete(async (e) => {
	await updateConfigurationCache();
	vscode.commands.executeCommand("twee3LanguageTools.refreshDiagnostics");
});

export interface Configuration {
	macros: Record<string, macros.macroDef>,
}

/// Used for when there there is an errored state
const EMPTY_CONFIGURATION = {
	macros: {},
};

export let configurationCache: Promise<Configuration> | null = null;

export const getConfiguration = function (): Promise<Configuration> {
	if (configurationCache === null) {
		updateConfigurationCache();
	}

	if (configurationCache === null) {
		// Config cache is still null.. probably an error.
		return Promise.resolve(EMPTY_CONFIGURATION);
	} else {
		return configurationCache;
	}
}

export const updateConfigurationCache = function () {
	let configuration = Promise.all([configurationCache, parseConfiguration()]).then(([lastConfiguration, configuration]) => {
		macros.onUpdateMacroCache(lastConfiguration?.macros, configuration.macros);

		return configuration;
	}, () => EMPTY_CONFIGURATION);

	configurationCache = configuration;
}

/**
 * Parses the configuration from the files without caching.
 */
export const parseConfiguration = async function (): Promise<Configuration> {
	var configuration: Configuration = {
		macros: Object.assign(Object.create(null), macroListCore),
	};

	for (let v of await vscode.workspace.findFiles("**/*.twee-config.{json,yaml,yml}", "**/node_modules/**")) {
		let file = await vscode.workspace.openTextDocument(v);
		let fileConfig: Configuration = EMPTY_CONFIGURATION;
		try {
			fileConfig = yaml.parse(file.getText())["sugarcube-2"] || EMPTY_CONFIGURATION;
			Object.values(fileConfig.macros).forEach(macro => {
				if (typeof macro.description === "string") {
					macro.description = new vscode.MarkdownString(macro.description);
					macro.description.baseUri = v;
				}
			});
		} catch (ex) {
			vscode.window.showErrorMessage(`\nCouldn't parse ${file.fileName}!\n\n${ex}\n\n`);
		}

		if (fileConfig !== EMPTY_CONFIGURATION) {
			// Merge the two configurations here.
			Object.assign(configuration.macros, fileConfig.macros);
		}
	}

	return configuration;
};