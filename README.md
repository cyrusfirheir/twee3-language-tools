# Twee Language Tools

Syntax highlighting for SugarCube 2, and Harlowe 3, on top of base colors for Twee 3 code.

[Repository](https://github.com/cyrusfirheir/twee3-language-tools).

---

## Requirements

Supported file extensions:

- `.tw`
- `.twee`

To set the correct storyformat for `.tw` (or `.twee`) files, a `StoryData` passage with the storyformat mentioned in it is preferred. If not, the extension provides the option to set the format explictly. (See [Extension Settings.](##extension-settings))

---

## Extension Settings

This extension contributes the following settings:

Automatically set by the `StoryData` special passage (if it exists):
- `twee3LanguageTools.format` : Name of Storyformat in use. 
- `twee3LanguageTools.formatVersion` : Version of storyformat in use.

Manual settings:
- `twee3LanguageTools.formatOverride` : Override the storyformat set by the `StoryData` special passage. Valid values:
    - `sugarcube-2`
    - `harlowe-3`

---

## Changelog

Changelog [here](CHANGELOG.md).

---