# Twee 3 Language Tools

Syntax highlighting for HTML and select storyformats (see [Features](#features)) on top of Twee 3 code.

## **Features**

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
    ![Harlowe syntax](https://imgur.com/9Z94sM4.png)

- `WIP` Code suggestions via [JSDoc](https://jsdoc.app/) comments. The extension scans through `*.tw`, `*.twee`, `*.d.js`, and `*.d.ts` files (excluding the directory `node_modules`) for JSDoc comments.
    - Comments with `@name` specified in them will show up as suggestions while typing, and pressing <kbd>Tab</kbd> or <kbd>Enter/Return</kbd> will insert the snippet of code with tab stops for each `@param` mentioned in the comment.  
    ![SugarCube JSDoc widget example](https://imgur.com/6w0DlY1.gif)
    - You can also specify the `@kind` of snippet (e.g. widget, macro). Including the word 'container' in the `@kind` string will add a closing tag for the inserted snippet.  
    ![SugarCube JSDoc container macro example](https://imgur.com/5cXnqIw.gif)

---

## Requirements

Supported file extensions:

- `.tw`
- `.twee`

To set the correct storyformat for `.tw` (or `.twee`) files, a `StoryData` passage with the storyformat mentioned in it is preferred. If not, the extension provides the option to set the format explictly. (See [Extension Settings.](#extension-settings))

---

## Extension Settings

This extension contributes the following settings:

Automatically set by the `StoryData` special passage (if it exists):
- `twee3LanguageTools.storyformat.id`: Identifier of the storyformat in use.
- `twee3LanguageTools.storyformat.name` : Name of the storyformat in use.
- `twee3LanguageTools.storyformat.version` : Version of the storyformat in use.

Manual settings:
- `twee3LanguageTools.storyformat.override` : Identifier of the storyformat to override the format set by `StoryData`. Valid values:
    - `chapbook-1`
    - `harlowe-3`
    - `sugarcube-2`

---

## Known issues

- If JSDoc comments containing widget/macro documentations are removed, older definitions still stay in memory, and cause the editor to provide suggestions for macros that are no longer documented. To fix, restart VSCode, or reload the window (type "Reload Window" into the command palette (<kbd>Ctrl/Cmd + Shift + P</kbd> by default)).

---

## Changelog

Changelog [here](CHANGELOG.md).

---