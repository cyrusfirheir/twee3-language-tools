# Enum substitution
In macro definition configuration files, variables can be defined that are inserted into the definitions after all configurations are loaded. These values are referred to as `enums` and work across all configurations, no matter which file they are defined in. This document goes over some high-level details of how it works, and how to use it with the extension. The operation is a simple string for string substitution with no validation or pre-processing.
  
## Enum syntax
**Supported**: Sugarcube 2
`%enumName%`

Valid characters for enums are alphanumeric characters and underscore (a-z, A-Z, 0-9, _).

Enums are respected and substituted inside macro `description` and `parameters` fields.

- If using `*.twee-config.yaml` (indentation is important for YAML files):
  ```yaml
  sugarcube-2:
    enums:
      colors: '"red"|"green"|"blue"|"pink"'
    macros:
      coloredbutton:
        name: coloredbutton
        description: |-
          `<<coloredbutton label color>>`

          `label`: What the button says

          `color`: %colors%
        parameters:
          - text &+ %colors%
  ```
- If using `*.twee-config.json`:
  ```json
  {
    "sugarcube-2": {
      "enums": {
        "colors": "\"red\"|\"green\"|\"blue\"|\"pink\""
      },
      "macros": {
        "coloredbutton": {
          "name": "coloredbutton",
          "description": "`<<coloredbutton label color>>`\n\n`label`: What the button says\n\n`color`: %colors%",
          "parameters": [
            "text &+ %colors%"
          ]
        }
      }
    }
  }
  ```

**Note**: Enums are evaluated globally and order of files processed is not guaranteed. Redefining enums differently in multiple locations may yield inconsistent results.

The extension provides the following enums by default:

**workspaceDir**: Root directory of the workspace opened in vscode. Will return a proper Uri for evaluation in local and web views.