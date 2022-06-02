
// The majority of this is from https://github.com/yzhang-gh/vscode-markdown/blob/2043c1b99541e4cc5734c6fc88714865d11a161a/src/formatting.ts

import { Position, Range, Selection, TextEditor, window, workspace, WorkspaceEdit } from "vscode";

export function styleByWrapping(editor: TextEditor, startPattern: string, endPattern = startPattern) {
    let selections = editor.selections;

    let batchEdit = new WorkspaceEdit();
    let shifts: [Position, number][] = [];
    let newSelections: Selection[] = selections.slice();

    for (const [i, selection] of selections.entries()) {

        let cursorPos = selection.active;
        const shift = shifts.map(([pos, s]) => (selection.start.line === pos.line && selection.start.character >= pos.character) ? s : 0)
            .reduce((a, b) => a + b, 0);

        if (selection.isEmpty) {
            const context = getContext(editor, cursorPos, startPattern, endPattern);

            // Patterns are added for SugarCube
            // No selected text
            if (
                startPattern === endPattern &&
                ["**", "*", "__", "_", "//", "''"].includes(startPattern) &&
                context === `${startPattern}text|${endPattern}`
            ) {
                // `**text|**` to `**text**|`
                let newCursorPos = cursorPos.with({ character: cursorPos.character + shift + endPattern.length });
                newSelections[i] = new Selection(newCursorPos, newCursorPos);
                continue;
            } else if (context === `${startPattern}|${endPattern}`) {
                // `**|**` to `|`
                let start = cursorPos.with({ character: cursorPos.character - startPattern.length });
                let end = cursorPos.with({ character: cursorPos.character + endPattern.length });
                wrapRange(editor, batchEdit, shifts, newSelections, i, shift, cursorPos, new Range(start, end), false, startPattern, endPattern);
            } else {
                // Select word under cursor
                // The markdown extension uses a custom regex very similar to this one for their def
                // of word. This removes the exclusion of certain characters since formats use them.
                let wordRange = editor.document.getWordRangeAtPosition(cursorPos, /(-?\d*\.\d\w*)|([^\!\@\#\%\^\&\(\)\-\=\+\[\{\]\}\\\|\;\:\"\,\.\<\>\?\s\，\。\《\》\？\；\：\‘\“\’\”\（\）\【\】\、]+)/g);
                if (wordRange == undefined) {
                    wordRange = selection;
                }
                // One special case: toggle strikethrough in task list
                const currentTextLine = editor.document.lineAt(cursorPos.line);
                if (startPattern === '~~' && /^\s*[\*\+\-] (\[[ x]\] )? */g.test(currentTextLine.text)) {
                    let match = currentTextLine.text.match(/^\s*[\*\+\-] (\[[ x]\] )? */g) as RegExpMatchArray;
                    wordRange = currentTextLine.range.with(new Position(cursorPos.line, match[0].length));
                }
                wrapRange(editor, batchEdit, shifts, newSelections, i, shift, cursorPos, wordRange, false, startPattern, endPattern);
            }
        } else {
            // Text selected
            wrapRange(editor, batchEdit, shifts, newSelections, i, shift, cursorPos, selection, true, startPattern, endPattern);
        }
    }

    return workspace.applyEdit(batchEdit).then(() => {
        editor.selections = newSelections;
    });
}

/**
 * Add or remove `startPattern`/`endPattern` according to the context
 * @param editor
 * @param options The undo/redo behavior
 * @param cursor cursor position
 * @param range range to be replaced
 * @param isSelected is this range selected
 * @param startPtn
 * @param endPtn
 */
function wrapRange(editor: TextEditor, wsEdit: WorkspaceEdit, shifts: [Position, number][], newSelections: Selection[], i: number, shift: number, cursor: Position, range: Range, isSelected: boolean, startPtn: string, endPtn: string) {
    let text = editor.document.getText(range);
    const prevSelection = newSelections[i];
    const ptnLength = (startPtn + endPtn).length;

    let newCursorPos = cursor.with({ character: cursor.character + shift });
    let newSelection: Selection;
    if (isWrapped(text, startPtn, endPtn)) {
        // remove start/end patterns from range
        wsEdit.replace(editor.document.uri, range, text.substr(startPtn.length, text.length - ptnLength));

        shifts.push([range.end, -ptnLength]);

        // Fix cursor position
        if (!isSelected) {
            if (!range.isEmpty) { // means quick styling
                if (cursor.character === range.end.character) {
                    newCursorPos = cursor.with({ character: cursor.character + shift - ptnLength });
                } else {
                    newCursorPos = cursor.with({ character: cursor.character + shift - startPtn.length });
                }
            } else { // means `**|**` -> `|`
                newCursorPos = cursor.with({ character: cursor.character + shift + startPtn.length });
            }
            newSelection = new Selection(newCursorPos, newCursorPos);
        } else {
            newSelection = new Selection(
                prevSelection.start.with({ character: prevSelection.start.character + shift }),
                prevSelection.end.with({ character: prevSelection.end.character + shift - ptnLength })
            );
        }
    } else {
        // add start/end patterns around range
        wsEdit.replace(editor.document.uri, range, startPtn + text + endPtn);

        shifts.push([range.end, ptnLength]);

        // Fix cursor position
        if (!isSelected) {
            if (!range.isEmpty) { // means quick styling
                if (cursor.character === range.end.character) {
                    newCursorPos = cursor.with({ character: cursor.character + shift + ptnLength });
                } else {
                    newCursorPos = cursor.with({ character: cursor.character + shift + startPtn.length });
                }
            } else { // means `|` -> `**|**`
                newCursorPos = cursor.with({ character: cursor.character + shift + startPtn.length });
            }
            newSelection = new Selection(newCursorPos, newCursorPos);
        } else {
            newSelection = new Selection(
                prevSelection.start.with({ character: prevSelection.start.character + shift }),
                prevSelection.end.with({ character: prevSelection.end.character + shift + ptnLength })
            );
        }
    }

    newSelections[i] = newSelection;
}

function isWrapped(text: string, startPattern: string, endPattern: string): boolean {
    return text.startsWith(startPattern) && text.endsWith(endPattern);
}

function getContext(editor: TextEditor, cursorPos: Position, startPattern: string, endPattern: string): string {
    let startPositionCharacter = cursorPos.character - startPattern.length;
    let endPositionCharacter = cursorPos.character + endPattern.length;

    if (startPositionCharacter < 0) {
        startPositionCharacter = 0;
    }

    let leftText = editor.document.getText(new Range(cursorPos.line, startPositionCharacter, cursorPos.line, cursorPos.character));
    let rightText = editor.document.getText(new Range(cursorPos.line, cursorPos.character, cursorPos.line, endPositionCharacter));

    if (rightText === endPattern) {
        if (leftText === startPattern) {
            return `${startPattern}|${endPattern}`;
        } else {
            return `${startPattern}text|${endPattern}`;
        }
    }
    return '|';
}