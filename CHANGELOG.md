# Changelog

## v0.6.0

Adds:

- Quick fixes:
	- Deprecated `<<end...>>` SC macros can be converted to the `<</...>>` form.
	- Unrecognized macros can now be defined and added to a local file (`t3lt.twee-config.yml`) with a quick fix. If the macro has been closed anywhere within the source file, the extension assumes the macro is a container and sets that property to `true`.

---

## v0.5.8

Adds:

- Settings to include/exclude directories from the search for twee files. See [Readme](README.md#extension-settings) for more details.

---

## v0.5.0

Adds:

- Grouping for the passage list tree view.

Fixes:

- Passage list not getting updated properly when files are renamed.

---

## v0.4.0

Adds:

- SugarCube:
	- The following diagnostics:
		- *`Error`* Container macros with opening tags but no closes (and vice-versa) for the core SugarCube library,
		- *`Warning`* Deprecated macros from the core SugarCube library,
		- *`Warning`* Deprecated `<<end...>>` macros,
		- *`Warning`* Unrecognized macros. This warning can be turned off by the `twee3LanguageTools.sugarcube-2.undefinedMacroWarnings` setting.

---

## v0.3.8

Adds:

- SugarCube:
    - JS syntax highlighting inside the `<<run>>` and `<<print>>` macros.
	- Container macros now have decorators for their closing tag. See [Readme](README.md#sugarcube) for more details.

---

## v0.3.3

Removes:

- Parsing of JSDoc comments to provide code suggestions. This was causing basic plaintext suggestions to stop working, and is a limitation of the code completion features VSCode facilitates. Going forward, suggestions will be left to code snippets defined in JSON files.

---

## v0.3.0

Adds:

- A new tree view container in the activity bar. Currently, it shows a list of passages across all Twee files in the workspace, along with links to jump to them. See [Readme](README.md#features) for screencaps.

Fixes:

- > ~~If JSDoc comments containing widget/macro documentations are removed, older definitions still stay in memory, and cause the editor to provide suggestions for macros that are no longer documented. To fix, restart VSCode, or reload the window (type "Reload Window" into the command palette (<kbd>Ctrl/Cmd + Shift + P</kbd> by default)).~~

---

## v0.2.0

Adds:

- Syntax highlighting for Chapbook 1.

- ~~JSDoc comment support for SugarCube. See [Readme](README.md#features) for more information.~~

Fixes:

- SugarCube block comments (`/* */`) not getting tokenized.

---

## v0.1.0

Initial release.

Adds:

- Syntax highlighting for Twee 3.

- Dynamic snippet for generating IFID for the `StoryData` special passage. Typing 'StoryData' provides a completion prompt which inserts a JSON chunk along with the generated IFID.

- The following diagnostics:
    - *`Error`* Malformed `StoryData` JSON,
    - *`Warning`* No whitespace between start token `::` and passage name.

- Automatic detection of storyformat plus an override option.

- Syntax highlighting for:
    - SugarCube 2,
    - Harlowe 3.

---