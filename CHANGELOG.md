# Changelog

Made possible through contributions from:
- [@Goctionni](https://github.com/Goctionni)
- [@MinusGix](https://github.com/MinusGix)
- [@rambdev](https://github.com/rambdev)

And feedback from the folks over at the Twine Games [Discord Server](https://discord.com/invite/n5dJvPp).

## v0.14.3

Fixes:

- Initial workspace diagnostics running in parallel with initial passage discovery, which resulted in nonexistent passage references.

---

## v0.14.0

Adds:

- Workspace statistics Status bar item (thanks to @rambdev).

---

## v0.13.15

Changes:

- StoryData snippet now populates the IFID field on its own. 

---

## v0.13.14

Adds:

- SugarCube 2 Snippets:
	- Link (Same Passage)
	- Print (Wrap)
	- Script (Wrap)

Changes:

- SugarCube 2 Snippets:
	- Added missing quotation marks to Audio and DOM macros

---

## v0.13.0

Adds:

- SugarCube 2 macro snippets (thanks to @rambdev).

---

## v0.12.2

Adds:

- SugarCube 2:
	- `<<done>>` macro definition.

Updates:

- (Experimental) [Example passage pre-processor](README.md#sugarcube-2-self-closing-macros) for the SugarCube 2 self-closing macro syntax.

---

## v0.12.0

Adds:

- (Experimental) Passage Auto-packer.

---

## v0.11.2

Fixes:

- Broken `Add to definitions` quickfix for `end...` *named* macros.

- Broken Passage header updates when saving position/size/tags from Story map to file.

---

## v0.11.0

Adds:

- Story Map:
	- Passage multi-select and the ability to mass edit position, size, and tags.
	- Move to file feature in story map.

	![move-to-file](docs/images/twee-storymap-move2file.png)

---

## v0.10.1

Fixes:

- Broken StoryMap-to-file updates when passage headers start with identical strings, i.e. modifying tags/metadata of `:: Passage Something` and `:: Passage Somethng Else` would end up affecting the header which comes first in the file.

Adds:

- Icon for `Jump-to-Passage` in the passage list.

---

## v0.10.0

Adds:

- An icon indicating the start passage in the Story Map.

---

## v0.9.2

Removes:

- Custom style markup highlighting which overwrote syntax highlighting for higher priority elements.

---

## v0.9.0

Fixes:

- Numerous bugs with argument parsing and validtion.

Adds:

- A sidebar to the storymap.
	
	![Sidebar](docs/images/twee-storymap-sidebar.png)

---

## v0.8.1

Adds:

- Caching functions to improve performance for large files (thanks to @Goctionni and @MinusGix).

---

## v0.8.0

Adds:

- A story map UI which opens in the browser (thanks to @Goctionni). Still in early stages, so feedback is welcome.

- SugarCube 2:
	- Macro argument validation (thanks to @MinusGix).

---

## v0.7.0

Adds:

- SugarCube 2: (both thanks to @MinusGix)
	- Macro documentation on hover.  
	- Diagnostics for invalid argument syntax in macros.

---

## v0.6.5

Adds:

- Setting:
	- `twee3LanguageTools.sugarcube-2.features.macroTagMatching`: Highlight opening and closing tags of container macros? (`true` by default.)

---

## v0.6.4

Adds:

- Experimental:
	- Self-closing macro syntax detection for SugarCube 2.

---

## v0.6.2

Adds:

- Passage grouping strategy:
	- Group by folder: Groups passages by the folders they originate from.

---

## v0.6.1

Adds:

- Setting:
	- `twee3LanguageTools.twee-3.warning.spaceAfterStartToken`: See [Issue #4](https://github.com/cyrusfirheir/twee3-language-tools/issues/4) (warning about no space between start token `::` and passage name).

Fixes:

- [Issue #3](https://github.com/cyrusfirheir/twee3-language-tools/issues/3) - False positives of SugarCube diagnostics in `script` and `stylesheet` tagged passages.

---

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

- SugarCube 2:
	- The following diagnostics:
		- *`Error`* Container macros with opening tags but no closes (and vice-versa) for the core SugarCube library,
		- *`Warning`* Deprecated macros from the core SugarCube library,
		- *`Warning`* Deprecated `<<end...>>` macros,
		- *`Warning`* Unrecognized macros. This warning can be turned off by the `twee3LanguageTools.sugarcube-2.undefinedMacroWarnings` setting.

---

## v0.3.8

Adds:

- SugarCube 2:
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