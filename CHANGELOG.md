# Changelog

## v0.2.0

Adds:

- Syntax highlighting for Chapbook 1.

- JSDoc comment support for SugarCube. See [Readme](README.md#features) for more information.

Fixes:

- SugarCube comments (`/* */`) not getting tokenized.

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