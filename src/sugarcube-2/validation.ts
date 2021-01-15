/*
    This file is for utilities relating to the validation/checking/correction of various parts of the code.
        Such as: Arguments, Parameters, Passages, and so on.
*/

import { Passage } from "../tree-view";


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
