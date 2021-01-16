/*
    This file is for utilities relating to the validation/checking/correction of various parts of the code.
        Such as: Arguments, Parameters, Passages, and so on.
*/

import { Passage } from "../tree-view";

// SugarCube has more complex checks for these, but we're only supporting VSCode and assume its
// whitespace handling is sane.
export const notSpaceRegex: RegExp = /\S/;
export const spaceRegex: RegExp = /\s/;
export const settingsSetupAccessRegexp: RegExp = /^(?:settings|setup)[.[]/;
export const varTestRegexp: RegExp = /^[$_][$A-Z_a-z][$0-9A-Z_a-z]*/;



// The warning class is for things that are technically 'errors' (in that they are invalid)
// but are likely just slightly incorrect and so should be counted as at least a partial validity
// (Ex: Passing a link with a setter to something that takes `linkNoSetter`)
// Could in the future provide quick fixes?
export class Warning {
    readonly message: string;

    constructor(message: string) {
        this.message = message;
    }
}

/**
 * Information about the state, used for verifying some parts of the arguments and parameters.
 */
export interface StateInfo {
    passages: Passage[],
}

/**
 * An interface for data which could have evaluatable data within it, but might not!
 * `T`: The type that would result from evaluating it. (Not that we can do that)
 * `B`: The original type (usually string).
 */
export interface Evaluatable<T, B> {
	original: B,
	isEvaluated: boolean,
	value?: T
}



/**
 * Simple function for if checking each of two array's elements are equal.
 * Uses triple-equals and does not do any recursive calls on sub-arrays.
 * Has the option to take undefined arrays, because that is just better for the place it is used in.
 */
export function isArrayEqual<T>(left?: T[], right?: T[]): boolean {
    if (left === right) {
        // They're the same array, or both undefined
        return true;
    } else if (left === undefined || right === undefined) {
        // We already checked for equality, so if either are undefined then we know it isn't equal
        return false;
    } else if (left.length !== right.length) {
        return false;
    }

    for (let i = 0; i < left.length; i++) {
        if (left[i] !== right[i]) {
            return false;
        }
    }
    return true;
}


/**
 * Tries getting the evaluated value of a TwineScript passage name.
 * Handles literals, and simple TwineScript strings.
 * @param validPassages 
 * @param passageName A TwineScript passage name.
 */
export function evalPassageId(validPassages: Passage[], passageName: string, allowBasicBareword: boolean = false): Evaluatable<string, string> {
	// SugarCube simply checks if it is null or if the passage name is valid before returning.
	// See: SugarCube2 wikifier.js evalPassageId for what we are imitating.
	if (passageName === "null" || validPassages.find(passage => passage.name === passageName)) {
		return {
			original: passageName,
			isEvaluated: true,
			value: passageName,
		}
	}

	return evaluateTwineScriptString(passageName, allowBasicBareword);
}


/**
 * Tries evaluating basic TwineScript strings.
 * This should hopefully be always correct, or at least correct often enough.
 * (And hopefully in the cases where it isn't correct, SugarCube will choke as well so we have more
 * of an excuse)
 * @param code The input TwineScript
 */
export function evaluateTwineScriptString(code: string, allowBasicBareword: boolean = false): Evaluatable<string, string> {
    // Note: If this is moved out of this function for re-use then that exec uses the state held
    // inside the regexp will have to be taken into account and reset/copy the regex before running.
    const parseRe = new RegExp([
        '(""|\'\')',                                          // 1=Empty quotes
        '("(?:\\\\.|[^"\\\\])+")',                            // 2=Double quoted, non-empty
        "('(?:\\\\.|[^'\\\\])+')",                            // 3=Single quoted, non-empty
        '([=+\\-*\\/%<>&\\|\\^~!?:,;\\(\\)\\[\\]{}]+)',       // 4=Operator delimiters
        '([^"\'=+\\-*\\/%<>&\\|\\^~!?:,;\\(\\)\\[\\]{}\\s]+)' // 5=Barewords
    ].join('|'), 'g');

    let match;

    while ((match = parseRe.exec(code)) !== null) {
        if (match[1] === code) { // Empty
            return {
                original: code,
                isEvaluated: true,
                value: "",
            };
        } else if (match[2] === code || match[3] === code) {
            return {
                original: code,
                isEvaluated: true,
                // Remove quotes
                value: code.slice(1, -1),
            }
        } else if (allowBasicBareword && match[5] === code) {
            // We allow simple barewords. This has the potential for false positives.
            // This is essentially meant just for links, where
            // [[blah]] could be the value in the global scope named `blah`, or a passage
            // named `blah`, and we want to consider that as a string
            if (match[5] === '$' || match[5] === '_') {
                break;
            } else if (varTestRegexp.test(match[5])) {
                break;
            }

            return {
                original: code,
                isEvaluated: true,
                value: code,
            };
        }
    }

    return {
        original: code,
        isEvaluated: false,
    }
}