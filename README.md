# Twee 3 Language Tools

Syntax highlighting for HTML and select storyformats (see [Features](#features)) on top of Twee 3 code.

## **Features**

### Twee
- Syntax highlighting.  
- Command palette tool to generate IFID: open the command palette (<kbd>Ctrl/Cmd + Shift + P</kbd> by default) and search for "IFID".  
- A list of passages for quick jumps.  
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
	- Macros with opening tags but no closes (and vice-versa): [screencap - SC open-close diagnostics](https://imgur.com/ReJBG4p.png)
	- Deprecated macros: [screencap - SC deprecated diagnostics](https://imgur.com/KS14xHZ.png)
	- Deprecated `<<end...>>` closing macros: [screencap - SC deprecated end tag diagnostics](https://imgur.com/VaXZorc.png)
	- Unrecognized macros. New/custom macros can be defined manually ([see custom macro definitions for SC](#custom-macro-definitions-for-sugarcube)), but anything else will throw a warning. This can be turned off by the `twee3LanguageTools.sugarcube-2.undefinedMacroWarnings` setting ([see settings](#extension-settings)): [screencap - SC unrecognized diagnostics)](https://imgur.com/gv3OJ4i.png)


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
		      name: customMacroName
		      container: true

		    anotherOne:
		      name: anotherOne
		```
	- If using `*.twee-config.json`:
		```json
		{
			"sugarcube-2": {
				"macros": {
					"customMacroName": {
						"name": "customMacroName",
						"container": true
					},
					"anotherOne": {
						"name": "anotherOne"
					}
				}
			}
		}
		```
**NOTE:** Multiple `twee-config` files can be present in a workspace. They will stack and add to the macro definitions for the workspace. The recommended strategy is to make separate files for separate macro sets/libraries, e.g. (the following files can also be used as examples):
- `click-to-proceed.twee-config.yaml` ([Link](https://github.com/cyrusfirheir/cycy-wrote-custom-macros/blob/master/click-to-proceed/click-to-proceed.twee-config.yaml)),
- `live-update.twee-config.yaml` ([Link](https://github.com/cyrusfirheir/cycy-wrote-custom-macros/blob/master/live-update/live-update.twee-config.yaml))

---

## **Extension Settings**

This extension contributes the following settings:

Automatically set by the `StoryData` special passage (if it exists):
- `twee3LanguageTools.storyformat.current`: Identifier of the storyformat in use.

Manual settings:
- `twee3LanguageTools.storyformat.override` : Identifier of the storyformat to override the format set by `StoryData`.
- `twee3LanguageTools.passage.list`: Collect passage names to display a list of quick 'jump' links? (`false` by default.)
- `twee3LanguageTools.sugarcube-2.undefinedMacroWarnings`: Warn about macros/widgets which were not found in definitions (`*.twee-config.yaml` or `*.twee-config.json` files) or the core SugarCube macro library? (`true` by default.)

---

## **Changelog**

Changelog [here](CHANGELOG.md).

---