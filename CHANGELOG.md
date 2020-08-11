# Changelog

## v0.1.0

Initial release.

- Adds syntax highlighting for Twee 3.

- Adds dynamic snippet for generating IFID for the `StoryData` special passage. Typing 'StoryData' provides a completion prompt which inserts a JSON chunk along with the generated IFID.

- Adds the following diagnostics:
    - *`Error`* Malformed `StoryData` JSON,
    - *`Warning`* No whitespace between start token `::` and passage name.

- Adds automatic detection of storyformat plus an override option.

- Adds syntax highlighting for:
    - SugarCube 2,
    - Harlowe 3.

---