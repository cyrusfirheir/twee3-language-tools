# Twee 3 Language Tools

Syntax highlighting for HTML and select storyformats (see [Features](#features)) on top of Twee 3 code.

## **Features**

### Twee
- Syntax highlighting.  
- Command palette tool to generate IFID: open the command palette (<kbd>Ctrl/Cmd + Shift + P</kbd> by default) and search for "IFID".  
- A list of passages for quick jumps (can be grouped by files, folders, or passage tags. See [extension-settings](#extension-settings).)  
    ![Passage List](https://imgur.com/3WObntl.png)

### Chapbook
*(id: `chapbook-1`)*
- Syntax highlighting.  
    ![Chapbook syntax](https://imgur.com/0SmpnBT.png)

### Harlowe
*(id: `harlowe-3`)*
- Syntax highlighting.  
    ![Harlowe syntax](https://imgur.com/XTWOyHP.png)

### SugarCube
*(id: `sugarcube-2`)*
- Syntax highlighting.  
    ![SugarCube syntax](https://imgur.com/9Z94sM4.png)
- Container macro pair highlights.
	![SC macro pairs](https://imgur.com/qjcr3ZK.png)
- Diagnostics:
	- Macros with opening tags but no closes (and vice-versa):
		- [Screenshot - diagnostics](https://imgur.com/ReJBG4p.png)
	- Deprecated macros:
		- [Screenshot - diagnostic](https://imgur.com/KS14xHZ.png)
	- Deprecated `<<end...>>` closing macros:
		- [Screenshot - diagnostic](https://imgur.com/VaXZorc.png)
		- [Screenshot - quick fix](https://imgur.com/A3MAZG2.png)
	- Unrecognized macros. New/custom macros can be defined manually ([see custom macro definitions for SC](#custom-macro-definitions-for-sugarcube)), but anything else will throw a warning. This can be turned off by the `twee3LanguageTools.sugarcube-2.undefinedMacroWarnings` setting ([see settings](#extension-settings)):
		- [Screenshot - diagnostic](https://imgur.com/gv3OJ4i.png)
		- [Screenshot - quick fix](https://imgur.com/RX5ztR8.png) (Writes definitions to `t3lt.twee-config.yml` in the root of the first workspace folder.)


---

## **Requirements**

The extension relies on a workspace (or a folder) being open. If single files are to be edited, the storyformat must be configured manually.

Supported file extensions:

- `.tw`
- `.twee`

To set the correct storyformat for the files, a `StoryData` passage with the storyformat (and version) (see example below) mentioned in it is preferred. If not, the extension provides the option to set the format explictly. (See [Extension Settings.](#extension-settings))

```json
:: StoryData
{
	"ifid": "514BB5F3-27EC-40E4-936B-45A21A048BCC",
	"format": "SugarCube",
	"format-version": "2.33.2"
}
```

---

## **twee-config**

### Custom Macro definitions for SugarCube

The extension adds diagnostics for erroneous usage of macros in TwineScript for the `sugarcube-2` storyformat. By default, only the definitions for the core SugarCube library are present, but custom definitions can be added. The process is as follows:

1. Add a `*.twee-config.yaml` (or `.yml`) **OR** `*.twee-config.json` (`*` represents any valid file name) file to your project folder (or anywhere in the workspace.)
2. Define custom macros as follows:
	- If using `*.twee-config.yaml` (indentation is important for YAML files):
		```yaml
		sugarcube-2:

		  macros:

		    customMacroName:
		      container: true

		    anotherOne: {}
		```
	- If using `*.twee-config.json`:
		```json
		{
			"sugarcube-2": {
				"macros": {
					"customMacroName": {
						"container": true
					},
					"anotherOne": {}
				}
			}
		}
		```
The following properties are currently programmed, even though not all of them are used as of now:
- **name** `(string)` *optional*: Name of the macro (currently unused in code; the name of the object suffices for now.)
- **description** `(string)` *optional*: Description of macro. Shown on hover.
- **container** `(boolean)` *optional*: If the macro is a container (i.e. requires a closing tag) or not. `false` by default.
- **selfClose** `(boolean)` *optional*: If the macro is a self-closable. Requires macro to be a container first. `false` by default.
- **children** `(string array)` *optional*: If the macro has children, specify their names as an array (currently unused in code.)
- **parents** `(string array)` *optional*: If the macro is a child macro, specify the names of its parents as an array (currently unused in code.)
- **deprecated** `(boolean)` *optional*: If the macro is deprecated or not. `false` by default.
- **deprecatedSuggestions** `(string array)` *optional*: If the macro is deprecated, specify any alternatives to the macro as an array. 

**NOTE:** Multiple `twee-config` files can be present in a workspace. They will stack and add to the macro definitions for the workspace. The recommended strategy is to make separate files for separate macro sets/libraries, e.g. (the following files can also be used as examples):
- `click-to-proceed.twee-config.yaml` ([Link](https://github.com/cyrusfirheir/cycy-wrote-custom-macros/blob/master/click-to-proceed/click-to-proceed.twee-config.yaml)),
- `live-update.twee-config.yaml` ([Link](https://github.com/cyrusfirheir/cycy-wrote-custom-macros/blob/master/live-update/live-update.twee-config.yaml))

---

## **Extension Settings**

This extension contributes the following settings:

Automatically set by the `StoryData` special passage (if it exists):
- `twee3LanguageTools.storyformat.current`: Identifier of the storyformat in use.

Manual settings:

**NOTE:** It's recommended to change these settings separately for each workspace instead of globally.

- `twee3LanguageTools.storyformat.override` : Identifier of the storyformat to override the format set by `StoryData`.  
⠀
- `twee3LanguageTools.directories.include`: Directories in which to look for twee files. Use glob patterns *relative* to the root of the workspace folders (e.g. `src/unprocessed/twee`, `src/static`, `external`). (Searches the entire workspace by default.)  
- `twee3LanguageTools.directories.exclude`: Directories to exclude from the search of twee files. Use *absolute* glob patterns (e.g. `**/src/processed/**`). (Excludes `**/node_modules/**` by default.) If passage listing is active, excluded files will not be scanned for passages. They also will not be scanned for errors until manually opened.  
⠀
- `twee3LanguageTools.passage.list`: Collect passage names to display a list of quick 'jump' links? (`false` by default.)  
- `twee3LanguageTools.passage.group`: Group passages by? (`None` by default. Can be grouped by file of origin, folder of origin, or passage tags.)  
⠀
- `twee3LanguageTools.twee-3.warning.spaceAfterStartToken`: Warn about missing space after the start token (`::`) in passage headers? (`true` by default.)  
⠀
- `twee3LanguageTools.sugarcube-2.warning.undefinedMacro`: Warn about macros/widgets which were not found in definitions (`*.twee-config.yaml` or `*.twee-config.json` files) or the core SugarCube macro library? (`true` by default.)  
- `twee3LanguageTools.sugarcube-2.warning.deprecatedMacro`: Warn about deprecated macros/widgets? (`true` by default.)  
- `twee3LanguageTools.sugarcube-2.warning.endMacro`: Warn about the deprecated `<<end...>>` closing tag syntax? (`true` by default.)  
⠀
- `twee3LanguageTools.sugarcube-2.features.macroTagMatching`: Highlight opening and closing tags of container macros? (`true` by default.)  
⠀
- `twee3LanguageTools.experimental.sugarcube-2.selfClosingMacros.enable`: Enable self-closing syntax for container macros? [Read here](#sugarcube-2-self-closing-macros) for more information. (`false` by default.)  
- `twee3LanguageTools.experimental.sugarcube-2.selfClosingMacros.warning.irrationalSelfClose`: Warn about self-closed instances of content focused macros (e.g. `<<script />>`)? (`true` by default.)  

---

## **Experimental Stuff**

### SugarCube-2: Self-closing macros

***NOTE:*** SugarCube 2 does *NOT* have a self-closing syntax for container macros, this feature is just to support custom passage processing functions.

Example of such a function which replaces self-closed instances with the actual closing macro tag (i.e. `<<macro />>` with `<<macro>><</macro>>`):
```js
Config.passages.onProcess = function(p) {
    return p.text.replace(/<<([A-Za-z][\w-]*|[=-])((?:\s*)((?:(?:`(?:\\.|[^`\\])*`)|(?:"(?:\\.|[^"\\])*")|(?:'(?:\\.|[^'\\])*')|(?:\[(?:[<>]?[Ii][Mm][Gg])?\[[^\r\n]*?\]\]+)|[^>]|(?:>(?!>)))*))\/>>/gm, "<<$1$2>><</$1>>");
};
```

The `twee3LanguageTools.experimental.sugarcube-2.selfClosingMacros.enable` setting enables detection of self-closed macros.

---

## **Changelog**

Changelog [here](CHANGELOG.md).

---