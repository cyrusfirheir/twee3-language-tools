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

	const files = vscode.workspace.findFiles("**/*.twee-config.{json,yaml,yml}", "**/{node_modules,.git}/**");

	await files.then((files) => {
		let configs: Thenable<Configuration>[] = [];
		for (let file of files) {
			configs.push(vscode.workspace.openTextDocument(file).then((doc) => {
				let fileConfig: Configuration = EMPTY_CONFIGURATION;

				fileConfig = yamlParse(doc.getText(), "sugarcube-2");
				if (fileConfig instanceof Error || (!fileConfig.macros)) {
					vscode.window.showErrorMessage(`\nCouldn't parse ${file}!\n\n${fileConfig}\n\n`);
					return EMPTY_CONFIGURATION;
				}
				Object.values(fileConfig.macros).forEach(macro => {
					if (typeof macro.description === "string") {
						macro.description = new vscode.MarkdownString(macro.description);
						macro.description.baseUri = file;
					}
				});

				return fileConfig;
			}));
		}
		return Promise.all(configs);
	})
	.then((configs: Configuration[]) => {
		Object.assign(configuration.macros, ...configs.map(c => c.macros));
	});

	return configuration;
};

/**
 * Turns raw text into parsed object using default, language-specific options
 * @param text Text contents of file
 * @param header Name of object to return from parsed yaml. Serves as language-specifier as well
 * @param options yaml.Options. Assigned on top of language defaults
 * @returns {Object | Error}
 */
export const yamlParse = function(text: string, header?: string, options?: yaml.Options): any {
	const defaults = {
		maxAliasCount: 1000,
	};

	options = Object.assign(defaults, options);

	try {
		let output = yaml.parse(text, options);
		if (header) {
			if (!output[header]) return Object.create(null);
			return output[header];
		}
		else {
			return yaml.parse(text, options);
		}
	}
	catch (ex) {
		return ex;
	}
}