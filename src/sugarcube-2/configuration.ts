import * as vscode from 'vscode';
import * as yaml from 'yaml';
import * as macros from './macros';
import * as macroListCore from './macros.json';

export const LanguageID = "twee3-sugarcube-2";

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

let languageConfigDisposable: vscode.Disposable | null = null;

export interface Configuration {
	macros: Record<string, macros.macroDef>,
	enums: Record<string, string>,
}

/// Used for when there there is an errored state
const EMPTY_CONFIGURATION = {
	macros: {},
	enums: {},
};

export let configurationCache: Promise<Configuration> | null = null;

const enumListCore = {
	// workspaceDir: "${workspaceFolder}"
	workspaceDir: vscode.workspace.workspaceFolders?.[0].uri ?? ".",
};

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
		macros.onUpdateMacroCache(lastConfiguration?.macros, configuration.macros, configuration.enums);

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
		enums: Object.assign(Object.create(null), enumListCore),
	};

	const files = vscode.workspace.findFiles("**/*.twee-config.{json,yaml,yml}", "**/{node_modules,.git}/**");

	await files.then((files) => {
		let configs: Thenable<Configuration>[] = [];
		for (let file of files) {
			configs.push(vscode.workspace.openTextDocument(file).then((doc) => {
				let fileConfig: Configuration = EMPTY_CONFIGURATION;

				fileConfig = yamlParse(doc.getText(), "sugarcube-2");
				if (fileConfig instanceof Error || (!fileConfig.macros && !fileConfig.enums)) {
					vscode.window.showErrorMessage(`\nCouldn't parse ${file}!\n\n${fileConfig}\n\n`);
					return EMPTY_CONFIGURATION;
				}
				Object.values(fileConfig.macros ?? []).forEach(macro => {
					if (typeof macro.description === "string") {
						macro.description = new vscode.MarkdownString(macro.description);
						macro.description.baseUri = file;
					}
				});
				const illegalEnums = Object.keys(fileConfig.enums ?? []).filter(enumName => !/^\w+$/.test(enumName));
				if (illegalEnums.length) {
					vscode.window.showErrorMessage(`\nEnum(s)\n\n${illegalEnums.join(", ")}\n\ncontain illegal characters and have been omitted`);
					illegalEnums.forEach(enumName => delete fileConfig.enums[enumName]);
				}

				return fileConfig;
			}));
		}
		return Promise.all(configs);
	})
	.then((configs: Configuration[]) => {
		Object.assign(configuration.macros, ...configs.map(c => c.macros));
		Object.assign(configuration.enums, ...configs.map(c => c.enums));
	});

	if (languageConfigDisposable) languageConfigDisposable.dispose();
	languageConfigDisposable = vscode.languages.setLanguageConfiguration(LanguageID, {
		onEnterRules: macros.generateMacroOnEnterRules(configuration.macros)
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
	const yamlDefaults = vscode.workspace.getConfiguration("twee3LanguageTools.yaml");
	const defaults = {
		merge: true,
		maxAliasCount: yamlDefaults.get("maxAliasCount"),
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