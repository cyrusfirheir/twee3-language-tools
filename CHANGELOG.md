# Changelog

## v0.3.0

Adds:

- A new tree view container in the activity bar. Currently, it shows a list of passages across all Twee files in the workspace, along with links to jump to them. See [Readme](README.md#features) for screencaps.

Fixes:

- > If JSDoc comments containing widget/macro documentations are removed, older definitions still stay in memory, and cause the editor to provide suggestions for macros that are no longer documented. To fix, restart VSCode, or reload the window (type "Reload Window" into the command palette (<kbd>Ctrl/Cmd + Shift + P</kbd> by default)).

---

## v0.2.0

Adds:

- Syntax highlighting for Chapbook 1.

- JSDoc comment support for SugarCube. See [Readme](README.md#features) for more information.

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