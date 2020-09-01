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

## **Extension Settings**

This extension contributes the following settings:

Automatically set by the `StoryData` special passage (if it exists):
- `twee3LanguageTools.storyformat.current`: Identifier of the storyformat in use.

Manual settings:
- `twee3LanguageTools.storyformat.override` : Identifier of the storyformat to override the format set by `StoryData`.
- `twee3LanguageTools.passage.list`: Collect passage names to display a list of quick 'jump' links?

---

## **Changelog**

Changelog [here](CHANGELOG.md).

---