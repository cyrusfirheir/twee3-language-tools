import * as vscode from 'vscode';
import { Passage } from '../tree-view';
import { Arg, ArgType, ExpressionArgument, ParsedArguments, SettingsSetupAccessArgument, VariableArgument } from './arguments';
import { StateInfo, Warning } from './validation';

export type UnparsedFormat = string;
// Note: This may eventually also be allowed to become an object, for more configuration options.
export type UnparsedVariant = UnparsedFormat;

/**
 * Helper function for constructing simple parameter types without the boilerplate
 */
function makeSimpleParameterType(name: string | string[], errorMessage: string, validateType: ((type: ArgType) => boolean) | ArgType) {
    if (typeof(name) === 'string') {
        name = [name];
    }

    if (typeof(validateType) === 'number') {
        // Store enum in separate variable
        const validateTypeCopy = validateType;
        // Create a closure for consistency
        validateType = type => type === validateTypeCopy;
    }

    // Hack to make typescript recognize that this has to be a function now.
    const validateTypeCallback = validateType as (type: ArgType) => boolean;
    return {
        name,
        validate (info: ArgumentInfo): Error | null {
            if (validateTypeCallback(info.arg.type)) {
                // Success.
                return null;
            } else {
                return new Error(errorMessage);
            }
        }
    };
}

/**
 * Parameter types.
 * These don't need to check for things that are already checked by the `isAlwaysArgument`.
 * Naming should be camelCase.
 * Type names are currently case-sensitive.
 */
export const parameterTypes: ParameterType[] = [
    makeSimpleParameterType("true", "Argument is not 'true'", ArgType.True),
    makeSimpleParameterType("false", "Argument is not 'false'", ArgType.False),
    makeSimpleParameterType(["bool", "boolean"], "Argument is not a boolean", type => type === ArgType.True || type === ArgType.False),
    makeSimpleParameterType("null", "Argument is not 'null'", ArgType.Null),
    makeSimpleParameterType("undefined", "Argument is not 'undefined'", ArgType.Undefined),
    makeSimpleParameterType("number", "Argument is not a number", ArgType.Number),
    makeSimpleParameterType("NaN", "Argument is not 'NaN'", ArgType.NaN),
    makeSimpleParameterType("link", "Argument is not a link", ArgType.Link),
    makeSimpleParameterType("image", "Argument is not an image", ArgType.Image),
    makeSimpleParameterType("bareword", "Argument is not a bareword", ArgType.Bareword),
    makeSimpleParameterType("string", "Argument is not a quoted string", ArgType.String),
    // This allows so many because they could all be turned-into/considered text.
    makeSimpleParameterType("text", "Argument is not text", t => t === ArgType.Bareword || t === ArgType.String || t === ArgType.True || t === ArgType.False || t === ArgType.Null || t === ArgType.NaN || t === ArgType.Number),
    {
        name: ["linkNoSetter"],
        validate(info: ArgumentInfo): Error | Warning | null {
            if (info.arg.type !== ArgType.Link) {
                return new Error("Argument is not a link");
            }

            if (info.arg.setter) {
                return new Warning("Argument is a link, but does not allow setter syntax");
            }

            // Success
            return null;
        }
    },
    {
        name: ["imageNoSetter"],
        validate(info: ArgumentInfo): Error | Warning | null {
            if (info.arg.type !== ArgType.Image) {
                return new Error("Argument is not an image");
            }

            if (info.arg.setter) {
                return new Warning("Argument is an image, but does not allow setter syntax");
            }

            // Success
            return null;
        }
    },
    {
        name: ["passage"],
        validate(info: ArgumentInfo): Error | Warning | null {
            // The passage, if it is undefined then we can't check it at runtime.
            let passageName: string | undefined = undefined;
            if (info.arg.type === ArgType.Bareword) {
                passageName = info.arg.value;
            } else if (info.arg.type === ArgType.String) {
                passageName = info.arg.text;
            } else if (info.arg.type === ArgType.NaN) {
                passageName = String(NaN);
            } else if (info.arg.type === ArgType.Number) {
                passageName = String(info.arg.value);
            }

            if (passageName !== undefined) {
                if (!info.state.passages.find(passage => passage.name === passageName)) {
                    return new Warning("Nonexistent passage");
                }
                return null;
            } else {
                // Based on SugarCube's Story.has, we don't allow booleans, null, objects, etc.
                return new Error("Argument is not an acceptable passage");
            }
        }
    }
];
export function findParameterType(name: string): null | ParameterType {
    for (let i = 0; i < parameterTypes.length; i++) {
        if (parameterTypes[i].name.includes(name)) {
            return parameterTypes[i];
        }
    }
    return null;
}
export interface ParameterType {
    /**
     * Names that this parameter goes by.
     */
    name: string[],
    /**
     * Checks if the parameter is valid here.
     * Returns `null` if there was no errors
     * otherwise returns an Error instance.
     */
    validate: (info: ArgumentInfo) => Error | Warning | null;
}

/**
 * Information about the arguments that are being parsed.
 */
interface ArgumentInfo {
    arguments: Arg[],
    // Index into `arguments` that our current argument is at.
    index: number,
    // Easy access. Equivalent to `arguments[index]`.
    arg: Arg,
    // Information about the state, used for some types which depend on other parts of the code
    state: StateInfo,
}

/**
 * TODO: use UnparsedMacro definition.
 * @param list The list of macros. Modified in-place.
 * @returns {Error[]} A potentially empty list of errors that occurred.
 */
export function parseMacroParameters(list: Record<string, Record<string, any>>): Error[] {
    let errors: Error[] = [];
    for (let key in list) {
        let macroDefinition = list[key];
        if (macroDefinition.parameters === undefined) {
            continue;
        }

        if (macroDefinition.parameters === null || typeof (macroDefinition.parameters) !== 'object' || Array.isArray(macroDefinition.parameters)) {
            errors.push(new Error(`Error while checking parameters of '${macroDefinition.name}': The parameters were not a valid object.`));
            delete macroDefinition.parameters;
            continue;
        } else if (macroDefinition.parameters instanceof Parameters) {
            // Ignore parameters that have already been parsed.
            continue;
        }

        try {
            // Overwrite the previous parameters with the parsed version
            macroDefinition.parameters = new Parameters(macroDefinition.parameters);
        } catch (err) {
            errors.push(new Error(`Error while parsing parameters of '${macroDefinition.name}': ${err.message || "Failed to get error message, please report this."}`));
        }
    }
    return errors;
}

export interface ChosenVariantInformation {
    // The key of the chosen variant.
    // null if no variant was chosen
    variantKey: string | null,
    info: ValidateInformation,
}
export class Parameters {
    variants: Record<string, Variant>;

    /**
     * Construct a new Parameters instance from the unvalidated json.
     * @param variants The variants/'overloads' of the macro's parameters.
     * @throws {Error}
     */
    constructor(variants: { [key: string]: any }) {
        let result: Record<string, Variant> = {};
        for (let key in variants) {
            if (variants[key] === null || variants[key] === undefined) {
                throw new Error(`Undefined/null variants are not allowed (variant: ${key}).`);
            } else if (typeof (variants[key]) === "string") {
                if (result.hasOwnProperty(key)) {
                    // We already have the key, which is strange.
                    // This probably isn't a duplicate key, but one like `__proto__`.
                    throw new Error(`Duplicate or unsupported variant name ${key}`);
                }
                result[key] = new Variant(variants[key]);
                // Note: Later we could add support for objects to make so that variants could have
                // configuration options
            } else {
                throw new Error(`Invalid value, currently only string variants allowed. (variant: ${key})`);
            }
        }
        this.variants = result;
    }

    /**
     * Check if any of the paths contain this format.
     * Does not do complex validation of if it is ever reachable.
     * @param testFormat 
     */
    has (testFormat: Format): boolean {
        for (const key in this.variants) {
            if (this.variants[key].has(testFormat)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Test whether the format contains a specific type in it.
     * Uses `has`. Minor helper utility.
     */
    hasType(type: ParameterType): boolean {
        return this.has({
            kind: FormatKind.Type,
            // Having to construct this is unfortunate, but it doesn't matter much.
            range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
            type,
        });
    }

    /**
     * Checks if two Parameters are loosely equivalent
     */
    compare(other: Parameters): boolean {
        if (Object.keys(this.variants).length !== Object.keys(other.variants).length) {
            // Different amount of keys so they cannot be equivalent.
            return false;
        }

        for (let key in this.variants) {
            let left: Variant = this.variants[key];
            let right: Variant | undefined = other.variants[key];
            if (right === undefined) {
                // Certainly not equal. One of the keys is gone.
                return false;
            } else if (!left.compare(right)) {
                // The variants weren't equivalent
                return false;
            }
        }

        // We've checked the number of keys, and they both have all the same variants.
        return true;
    }

    /**
     * Checks the given arguments for their matching to a chosen
     * @param args The parsed arguments for type validation
     */
    validate(args: ParsedArguments, stateInfo: StateInfo): ChosenVariantInformation {
        // We track the current most likely variant based on type and somewhat on
        // argument count. This certainly isn't the most accurate implementation but it
        // should work well enough for now.
        let highestVariant: ChosenVariantInformation = {
            variantKey: null,
            info: {
                errors: [],
                warnings: [],
                rank: -1,
                argIndex: 0
            }
        };

        // TODO: Add rank based on correct argument count?

        for (const variantKey in this.variants) {
            const variant = this.variants[variantKey];
            let info = variant.validate(args, stateInfo);

            if (info.rank > highestVariant.info.rank) {
                highestVariant.info = info;
                highestVariant.variantKey = variantKey;
            }
        }

        return highestVariant;
    }

    /**
     * Whether the variants are empty.
     */
    isEmpty(): boolean {
        for (let key in this.variants) {
            if (!this.variants[key].isEmpty()) {
                // We found a non-empty entry.
                return false;
            }
        }
        return true;
    }
}
/**
 * Information about the result of validating a variant.
 */
export interface ValidateInformation {
    warnings: ArgumentWarning[],
    errors: ArgumentError[],
    // The ranking that it received.
    // A 'minimum' goal of the rank is to at always (or at least try) to get the highest rank
    // for a variant if it exactly matches the argument types without errors.
    rank: number,
    // The index that was reached into the arguments.
    argIndex: number,
}
/**
 * An error for a specific argument.
 */
export interface ArgumentError {
    error: Error,
    // Index into arguments
    index: number,
}
/**
 * A warning for a specific argument.
 */
export interface ArgumentWarning {
    warning: Warning,
    // Index into arguments
    index: number,
}
export class Variant {
    formatString: UnparsedFormat;
    format: Format | null;

    /**
     * Constructs a new variant, parsing the given format string into an easier form.
     * @param formatString The format string to be parsed.
     * @throws {Error}
     */
    constructor(formatString: UnparsedFormat) {
        this.formatString = formatString;
        this.format = Variant.parseFormat(formatString);
    }

    /**
     * Whether or not the variant is empty.
     */
    isEmpty(): boolean {
        return this.format === null;
    }
    
    /**
     * Test whether the format contains the given format in any of its paths.
     * @param testFormat
     */
    has(testFormat: Format): boolean {
        if (this.format === null) {
            return false;
        }

        return formatHas(this.format, testFormat);
    }

    /**
     * Whether two variants are loosely equivalent.
     */
    compare(other: Variant): boolean {
        // We don't bother comparing their format string, what matters is the parsed version
        if (this.format === other.format) {
            return true;
        } else if (this.format === null || other.format === null) {
            return false;
        }
        return compareFormat(this.format, other.format);
    }

    /**
     * Limitation on how many times the validation can iterate before stopping.
     * TODO: Configurable in settings. Perhaps configurable per macro for really expensive macros.
     */
    private static ValidateLimit: number = 2000;
    /**
     * Checks if the arguments are valid based on this variant.
     */
    validate(parsedArguments: ParsedArguments, stateInfo: StateInfo): ValidateInformation {
        // Shorthand
        const args = parsedArguments.arguments;
        let iterations: number = 0;

        enum Status {
            NotFoundFailure,
            Failure,
            Success,
        }
        function isFailure (status: Status): status is (Status.Failure | Status.NotFoundFailure){
            return status === Status.Failure || status == Status.NotFoundFailure;
        }

        interface CrawlInformation extends ValidateInformation {
            status: Status,
        }
        /**
         * Construct an error CrawlInformation.
         * Note: This assumes that the given argIndex is the place where the error happened!
         * Pure.
         */
        function makeError(status: Status, text: string, argIndex: number, rank: number = 0): CrawlInformation {
            return {
                errors: [{
                    error: new Error(text),
                    index: argIndex,
                }],
                warnings: [],
                rank,
                argIndex,
                status,
            };
        }
        /**
         * Construct a simple success CrawlInformation.
         * Pure.
         */
        function makeSuccess(argIndex: number, rank: number, warnings: ArgumentWarning[] = []): CrawlInformation {
            return {
                errors: [],
                warnings,
                rank,
                argIndex,
                status: Status.Success,
            }
        }

        // The type was correct
        const correctTypeRank: number = 1;
        // The type and value were correct
        const correctRank: number = correctTypeRank + 1;

        // This isn't the most efficient it could be.
        // 1: We could transform repeated instances of certain operators into list versions
        // which would be easier to check and deal with, and probably faster due to less recursion
        // and passing around objects of information. `Or` is the most obvious recipient of this.
        // 2: We construct a lot of errors that aren't used. This could be delayed using
        // closures in many of the cases, which I presume are faster to construct than performing
        // string formatting.
        // As well there are some reasoning problems within that could be improved:
        // 1: Ranks. In some cases this makes sense to keep.
        //  If you're parsing a maybenext, then should it keep the rank from the right side even if
        //  it failed? The immediate answer is no, but shouldn't it factor into how it chooses the 
        //  correct variant? This could be done through two methods:
        //      1: Messing with the rank. If the optional part of the maybenext failed then it gets
        //         mathematically messed with. Perhaps divided by 2 then added. This has the problem
        //         of being iffy and making it even harder to reason about how it chooses a good
        //         variant.
        //      2: New property. Perhaps globalRank that gets added despite errors, used for
        //         complete type matches on arguments?
        /**
         * Crawl the tree.
         * This shouldn't run have issues with stack overflow bcs the limited complexity of macros
         * @param format The format we are on
         * @param argIndex The index into the arguments that this branch of crawl is using.
         */
        function crawl(format: Format, argIndex: number): CrawlInformation {
            iterations++;
            if (iterations >= Variant.ValidateLimit) {
                throw new Error(`Validating macro took excessive amount of checking. Quitting. Got to argument ${argIndex}.`);
            }

            if (format.kind === FormatKind.MaybeNext) {
                let rank: number = 0;
                let warnings: ArgumentWarning[] = [];
                // If we have a left, then that has to exist before the right can be thought about
                if (format.left) {
                    const infoLeft = crawl(format.left, argIndex);
                    rank += infoLeft.rank;
                    argIndex = infoLeft.argIndex;
                    // If the status is NotFoundFailure or Failure then we have failed.
                    if (isFailure(infoLeft.status)) {
                        // Return info since we failed and the left hand side is required.
                        return infoLeft;
                    }

                    warnings = infoLeft.warnings;
                }

                const infoRight = crawl(format.right, argIndex);
                if (infoRight.status === Status.NotFoundFailure) {
                    // It wasn't found. We can continue on from that since it was optional.
                    return makeSuccess(argIndex, rank, warnings);
                } else if (isFailure(infoRight.status)) {
                    // It was an error.
                    infoRight.status = Status.Failure;
                    return infoRight;
                }

                argIndex = infoRight.argIndex;
                rank += infoRight.rank;
                warnings = warnings.concat(infoRight.warnings);
                return makeSuccess(argIndex, rank, warnings);
            } else if (format.kind === FormatKind.AndNext) {
                let rank: number = 0;
                let warnings: ArgumentWarning[] = [];

                const infoLeft = crawl(format.left, argIndex);
                if (isFailure(infoLeft.status)) {
                    infoLeft.status = Status.Failure;
                    return infoLeft;
                }

                rank += infoLeft.rank;
                argIndex = infoLeft.argIndex;
                warnings = warnings.concat(infoLeft.warnings);

                const infoRight = crawl(format.right, argIndex);
                if (isFailure(infoRight.status)) {
                    infoRight.status = Status.Failure;
                    // TODO: should we try wrapping the error or adding our own?
                    return infoRight;
                }

                rank += infoRight.rank;
                argIndex = infoRight.argIndex;
                warnings = warnings.concat(infoRight.warnings);

                return makeSuccess(argIndex, rank, warnings);
            } else if (format.kind === FormatKind.Or) {
                const infoLeft = crawl(format.left, argIndex);
                if (!isFailure(infoLeft.status)) {
                    return infoLeft;
                }

                const infoRight = crawl(format.right, argIndex);
                if (!isFailure(infoRight.status)) {
                    return infoRight;
                }

                // If we failed on both accounts, then we return the infoLeft version
                // as our error, since that is the first version.
                // That will somewhat let it ''select'' the error to be shown
                // TODO: should we wrap the error or add our own?
                // Note: We don't set this to Status.Failure, because NotFound errors need to 
                // propagate from this
                return infoLeft;
            } else if (format.kind === FormatKind.Repeat) {
                let rank: number = 0;
                let warnings: ArgumentWarning[] = [];

                while (true) {
                    const info = crawl(format.right, argIndex);
                    // Repeat handles errors by just.. stopping.
                    // Because you might have crazy setups, and this will be caught
                    // by other parts (probably).
                    if (isFailure(info.status)) {
                        break;
                    }
                    argIndex = info.argIndex;
                    rank += info.rank;
                    warnings = warnings.concat(info.warnings);
                }

                // We'll always succeed with a repeat, since it is zero or more.
                return makeSuccess(argIndex, rank, warnings);
            } else if (format.kind === FormatKind.Literal) {
                let arg = args[argIndex];
                if (arg === undefined) {
                    return makeError(Status.NotFoundFailure, `Expected literal '${format.value}' but there was no argument`, argIndex);
                }

                // The success is the same for all, but their errors are different
                // so it is constructed here to avoid repetitiveness. This is fine since
                // `makeSuccess` is 'pure'.
                const success = makeSuccess(argIndex + 1, correctRank);
                if (isAlwaysArgument(arg)) {
                    return success;
                } else if (arg.type === ArgType.String) {
                    if (arg.text === format.value) {
                        return success;
                    } else {
                        return makeError(Status.Failure, `Found string, but its value was not the expected '${format.value}'`, argIndex, correctTypeRank);
                    }
                } else if (arg.type === ArgType.Bareword) {
                    if (arg.value === format.value) {
                        return success;
                    } else {
                        return makeError(Status.Failure, `Found text, but its value was not the expected '${format.value}'`, argIndex, correctTypeRank);
                    }
                } else if (
                    // Handle cases that have their own ArgType but make sense to be literals.
                    (format.value === 'null' && arg.type === ArgType.Null) ||
                    (format.value === 'undefined' && arg.type === ArgType.Undefined) ||
                    (format.value === 'true' && arg.type === ArgType.True) ||
                    (format.value === 'false' && arg.type === ArgType.False) ||
                    (format.value === 'NaN' && arg.type === ArgType.NaN)
                ) {
                    return success;
                } else if (arg.type === ArgType.Number && arg.value.toString() === format.value) {
                    // TODO: Due to IEEE-754 floats display not being completely sane to compare as
                    // strings, it would probably be a good idea to warn the user if their format
                    // contains literals that look like they're meant to be floats.
                    return success;
                } else {
                    return makeError(Status.Failure, `Expected literal ('${format.value}'), but found:  `, argIndex);
                }
            } else if (format.kind === FormatKind.Type) {
                const arg = args[argIndex];
                const type = format.type;
                if (arg === undefined) {
                    return makeError(Status.NotFoundFailure, `Expected type '${type.name[0] || "UNNAMED TYPE"}' but there was no argument`, argIndex);
                } else if (isAlwaysArgument(arg)) {
                    return makeSuccess(argIndex + 1, correctRank);
                }

                const result = type.validate({
                    arg,
                    index: argIndex,
                    arguments: args,
                    state: stateInfo,
                });

                if (result instanceof Error) {
                    // Failure
                    return {
                        argIndex,
                        rank: 0,
                        errors: [{
                            error: result,
                            index: argIndex,
                        }],
                        warnings: [],
                        status: Status.Failure,
                    };
                } else if (result instanceof Warning) {
                    // Success but we received a warning.
                    // TODO: Slightly decrease the rank due to warning?
                    return makeSuccess(argIndex + 1, correctRank, [{
                        warning: result,
                        index: argIndex,
                    }]);
                } else {
                    // Success. (result === null)
                    return makeSuccess(argIndex + 1, correctRank);
                }
            } else {
                // Typescript thinks format is 'never' here, but if the error is removed then it
                // thinks that not all paths exit
                throw new Error(`Validator: Unhandled format kind`);
            }
        }

        if (this.format === null) {
            // TODO: is this sensible handling of no arguments or should we spit out an error here 
            // if we got more?
            // probably spit out an error since this is an empty variant?
            return {
                errors: [],
                warnings: [],
                rank: 0,
                argIndex: 0,
            };
        }

        const crawlInfo = crawl(this.format, 0);
        // Remove extra parameters
        return {
            rank: crawlInfo.rank,
            errors: crawlInfo.errors,
            warnings: crawlInfo.warnings,
            argIndex: crawlInfo.argIndex,
        };
    }

    /**
     * Limit on the number of 'iterations' the parser can perform.
     * This may be too high.
     * TODO: Allow this to be configured in the vscode settings.
     */
    private static ParserLimit: number = 2000;

    /**
     * Parses the format string into a tree of `Format` 'nodes'.
     * @param formatString The format string to parse and validate
     * @throws {Error}
     */
    private static parseFormat(formatString: UnparsedFormat): Format | null {
        let lexed = Variant.lexFormat(formatString);
        let index: number = 0;
        // Keep track of iterations to avoid infinite loops.
        let iterations: number = 0;

        if (lexed.length === 0) {
            return null;
        }

        // Pratt parser implementation derived from:
        // https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html

        // Binding Power: The higher the value the harder it binds relative to other binding powers.
        // The binding power should _not_ be the same between operators unless they are really
        // meant to be on the same 'level'. Such as + and -, or * and / in mathematics.
        function infixBindingPower(op: FormatKind): [number, number] | null {
            switch (op) {
                case FormatKind.Or:
                    return [9, 10];
                case FormatKind.AndNext:
                    return [4, 5];
                case FormatKind.MaybeNext:
                    // This binds _less* than `And-Then` because of cases like:
                    // `alpha &+ 'start' |+ number |+ 'class' &+ text` to be parsed as
                    // `alpha &+ ('start' |+ number) |+ ('class' &+ text)`
                    return [2, 3]
                default:
                    return null;
            }
        }
        function prefixBindingPower(op: FormatKind): number {
            switch (op) {
                // Currently and next is now allowed in prefix position as it is useless there.
                // case FormatKind.AndNext:
                //     return [1, 2];
                case FormatKind.MaybeNext:
                    // the pratt parsing article _does_ use higher values for the infix version of
                    // + and -, but that is to make it bind harder than * and /, so that you can do
                    // -4 * 3 -> (-4) * 3
                    // but this is not higher than anything besides its infix companion.
                    // So,
                    // |+ a |+ b
                    // would be:
                    // (|+ a) |+ b
                    // but if they were equivalent it wouldn't matter
                    // If this was _lower_ for some reason then:
                    // |+ (a |+ b)
                    // but that doesn't have any change either.
                    return 3;
                case FormatKind.Repeat:
                    // This should bind appropriately hard but less than the or operator.
                    // Ex: ...a|b
                    // parsing it as (...a)|b
                    // Doesn't provide much utility commonly. Repeats of a or b.
                    // More common is wanting ...(a|b)
                    // And so this has a higher but less than or binding power
                    // ... \+ a
                    // Is pretty.. uh.. something, but it makes sense to parse it as
                    // repeats of optional a or as a syntax error.
                    return 8;
                default:
                    throw new Error("Parse: Unhandled operator in infix binding power of: " + op);
            }
        }

        function isPrefixOperator(token: FormatLex): token is (FormatLexMaybeNext | FormatLexRepeat) {
            return token.kind === FormatKind.MaybeNext || token.kind === FormatKind.Repeat;
        }

        function isValue(token: FormatLex): token is (FormatLiteral | FormatType) {
            return token.kind === FormatKind.Literal || token.kind === FormatKind.Type;
        }

        function exprBp(minBp: number): Format {
            iterations++;
            if (iterations >= Variant.ParserLimit) {
                throw new Error("Parser: Iterated too many times when parsing format. This might be an internal error, or due to a very complex input.");
            }

            if (!lexed[index]) {
                throw new Error("Parse: Expected there to be a value at the given index.");
            }

            // The left-hand-side of the expression.
            let lhs: Format;

            const current: FormatLex = lexed[index];
            index++;
            if (isPrefixOperator(current)) {
                const rBp = prefixBindingPower(current.kind);
                const rhs = exprBp(rBp);
                lhs = {
                    kind: current.kind,
                    range: current.range,
                    right: rhs,
                };
            } else if (current.kind === FormatKind.Group) {
                if (current.open) {
                    lhs = exprBp(0);
                    const after: FormatLex = lexed[index];
                    if (after && after.kind === FormatKind.Group) {
                        if (after.open) {
                            throw new Error("Parse: Expected closing parentheses but found opening parentheses!");
                        }
                        // Otherwise, we're good. Advance past the closing paren
                        index++;
                    } else {
                        throw new Error("Parse: Expected closing parentheses");
                    }
                } else {
                    throw new Error("Parse: Did not expect opening parentheses");
                }
            } else if (isValue(current)) {
                // Sanity: all lexed tokens that are values are the same as their format definitions
                lhs = current;
            } else {
                throw new Error("Parse: Expected there to be literal or a type");
            }

            for (; ;) {
                iterations++;
                if (iterations >= Variant.ParserLimit) {
                    throw new Error("Parser: Iterated too many times when parsing format operators. This might be an internal error, or due to a very complex input.");
                }

                const op = lexed[index];
                if (op === undefined) break;
                const bindingPower = infixBindingPower(op.kind);
                if (bindingPower !== null) {
                    let [lBp, rBp] = bindingPower;
                    if (lBp < minBp) {
                        break;
                    }

                    index++;
                    const rhs = exprBp(rBp);

                    // TODO: don't use as Format here to assure it that we're sane.
                    lhs = {
                        kind: op.kind,
                        range: op.range,
                        left: lhs,
                        right: rhs,
                    } as Format;
                } else {
                    break;
                }
            }

            return lhs;
        }

        return exprBp(0);
    }

    /**
     * The maximum number of iterations whilst parsing.
     * This helps avoid bugs that cause it to process for too long, and most sane input would be
     * less than this.
     * TODO: Make this a settings option.
     */
    private static LexLimit: number = 1000;
    private static Whitespace: RegExp = /\s/;
    private static IdentifierStart: RegExp = /[a-zA-Z]/;
    // Note: Currently this is the same as IdentifierStart, but could be expanded to allow numbers
    // if desired.
    private static Identifier: RegExp = /[a-zA-Z]/;
    // Characters which the identifier parsing should stop at and let alternative parts of the code
    // handle.
    private static IdentifierStop: RegExp = /[\|\&\+\-\s\)\(]/;
    private static Quote: RegExp = /[\'\"]/;
    private static Digit: RegExp = /[0-9]/;

    /**
     * Turns the format string into a flat array of `FormatLex` (tokens essentially) for parsing.
     * Also performs some limited validation. Has some special handling for likely common errors to
     * provide better error messages.
     * @param formatString The format for the parameters to be lexed.
     * @throws {Error}
     */
    private static lexFormat(formatString: UnparsedFormat): FormatLex[] {
        // Our index within the `formatString`.
        let position: number = 0;
        // The resulting tokens.
        let lexed: FormatLex[] = [];
        // Tracks the current number of iterations to avoid infinite loops or non-sane input.
        let iterations = 0;

        // Construct a range on the line.
        // Ranges don't make 100% sense, since we're not in an actual document, but it works well
        // enough, just having the line number be 0.
        function makeRange(start: number, end: number, line: number = 0): vscode.Range {
            return new vscode.Range(new vscode.Position(line, start), new vscode.Position(line, end));
        }

        // TODO: we could probably use the SugarCube lexer in arguments.ts since it is pretty good?
        // TODO: If we don't do that, this could also be broken down into smaller component
        // functions to make reading it easier, though that does make passing around the position
        // state harder.
        for (; ;) {
            // Guard against infinite loops.
            iterations++;
            if (iterations >= Variant.LexLimit) {
                throw new Error("Lex: Iterated too many times when parsing format. This might be an internal error, or a very long input string.");
            }
            if (position >= formatString.length) {
                // We have finished parsing.
                break;
            }

            let chr = formatString[position];
            if (Variant.Whitespace.test(chr)) {
                // Ignore it, whitespace only matters in literals.
                position++;
            } else if (chr === '&') {
                // &+
                let start = position;
                // Consume &
                position++;
                let next = formatString[position];
                if (next === '+') {
                    // Consume +
                    position++;
                    lexed.push({
                        kind: FormatKind.AndNext,
                        range: makeRange(start, position),
                    });
                } else if (next === undefined) {
                    throw new Error("Lex: Expected input to continue after `&`, did you mean to use `&+`? Content is still required after such.");
                } else if (next === "-") {
                    throw new Error("Lex: Found `&-`, did you mean to use `&+`?");
                } else if (Variant.IdentifierStart.test(next) || Variant.Quote.test(next)) {
                    throw new Error(`Lex: Found '&${next}', did you mean to do '&+${next}'?`);
                } else {
                    throw new Error(`Lex: Found invalid character after '&': '${next}'. Did you mean to use \`&+\`?`);
                }
            } else if (chr === '|') {
                // | or |+
                let start = position;
                // Consume |
                position++;
                let next = formatString[position];
                if (next === "+") {
                    // |+
                    // Consume +
                    position++;
                    lexed.push({
                        kind: FormatKind.MaybeNext,
                        range: makeRange(start, position),
                    });
                } else if (next === undefined) {
                    throw new Error("Lex: Expected input to continue after `|`, did you mean to use `|+` or `|`? Content is still required after both.");
                } else if (Variant.IdentifierStart.test(next) || Variant.Quote.test(next)) {
                    // |
                    lexed.push({
                        kind: FormatKind.Or,
                        range: makeRange(start, position),
                    });
                } else if (next === "-") {
                    throw new Error("Lex: Found `|-`, did you mean to use `|+` or `&+`?");
                } else {
                    throw new Error(`Lex: Found invalid character after '|': '${next}'. Did you mean to use \`|+\`?`);
                }
            } else if (Variant.Quote.test(chr)) {
                let openingQuote = chr;
                // Start is at the quote.
                let start = position;
                position++;
                while (true) {
                    iterations++;
                    if (iterations >= Variant.LexLimit) {
                        throw new Error("Lex: Iterated too many times when parsing string. This might be an internal error, or a very long input string.");
                    }

                    let current = formatString[position];
                    // TODO: Escape sequences:
                    // \n,\t,\f?,\x?,\u?,\\,\",\'
                    if (current === undefined) {
                        throw new Error("Lex: Failed to parse string, found end of input before closing quote.");
                    } else if (current === openingQuote) {
                        // See code after while loop
                        break;
                    } else {
                        // Simply increment the position.
                        // We'll just slice it out of the string once it is done.
                        position++;
                    }
                }

                // This does not include the current position
                // So this text contains the text within the string, without the quotation marks.
                const text = formatString.slice(start + 1, position);
                // TODO: We'll have t actually replace the escape sequences here?
                // Skip past the closing quote.
                position++;

                lexed.push({
                    kind: FormatKind.Literal,
                    range: makeRange(start, position),
                    value: text,
                });
            } else if (chr === '(' || chr === ')') {
                const start = position;
                position++;
                lexed.push({
                    kind: FormatKind.Group,
                    range: makeRange(start, position),
                    open: chr === '(',
                });
            } else if (Variant.IdentifierStart.test(chr)) {
                let start = position;
                position++;
                while (true) {
                    iterations++;
                    if (iterations >= Variant.LexLimit) {
                        throw new Error("Lex: Iterated too many times when parsing identifier. This might be an internal error, or a very long input string.");
                    }

                    let current = formatString[position];
                    if (current === undefined || Variant.IdentifierStop.test(current)) {
                        // See: After while loop
                        break;
                    } else if (Variant.Identifier.test(chr)) {
                        // Consume this part of the identifier.
                        position++;
                    } else if (Variant.Quote.test(current)) {
                        throw new Error(`Lex: Found quote mark (${current}) directly next to parameter type. Did you mean to use the \`|\` operator?`);
                    } else if (Variant.Digit.test(current)) {
                        throw new Error(`Lex: Found digit '${current}' after parameter type, but digits are not supported in those.`);
                    } else {
                        throw new Error(`Lex: Found invalid parameter type character: '${current}'.`);
                    }
                }

                const identifier: string = formatString.slice(start, position);
                let parameterType = findParameterType(identifier);
                if (parameterType !== null) {
                    lexed.push({
                        kind: FormatKind.Type,
                        range: makeRange(start, position),
                        type: parameterType,
                    });
                } else {
                    throw new Error(`Lex: Failed to find parameter type '${identifier}'.`);
                }
            } else if (chr === '.' && formatString[position + 1] === '.' && formatString[position + 2] === '.') {
                let start = position;
                // Consume ...
                position += 3;

                // Note: After the repeat should be an type|literal|group
                lexed.push({
                    kind: FormatKind.Repeat,
                    range: makeRange(start, position),
                });
            } else if (chr === '+') {
                throw new Error("Lex: Lone `+` symbol, did you mean to use `|+` or `&+`?");
            } else if (chr === '`') {
                throw new Error("Lex: Found ` character, did you mean to use single quote '?");
            } else {
                throw new Error(`Lex: Unrecognized symbol: '${chr}'`);
            }
        }

        return lexed;
    }
}

export enum FormatKind {
    // See: parameterTypes.
    Type,
    // 'text'
    Literal,
    // (format)
    Group,
    // format &+ format
    AndNext,
    // format |+ format
    MaybeNext,
    // format|format|format..
    Or,
    // ...
    Repeat,
}
type FormatLex = FormatType | FormatLiteral | FormatLexGroup | FormatLexAndNext | FormatLexMaybeNext | FormatLexOr | FormatLexRepeat;
interface FormatLexGroup {
    kind: FormatKind.Group,
    range: vscode.Range,
    open: boolean,
}
interface FormatLexAndNext {
    kind: FormatKind.AndNext,
    range: vscode.Range,
}
interface FormatLexMaybeNext {
    kind: FormatKind.MaybeNext,
    range: vscode.Range,
}
interface FormatLexOr {
    kind: FormatKind.Or,
    range: vscode.Range,
}
interface FormatLexRepeat {
    kind: FormatKind.Repeat,
    range: vscode.Range,
}

// FormatKind (lexer) without the Group, since that does not appear.
// Sadly this isn't an enum, so we still have to ues formatkind.
export type FormatParseKind = Exclude<FormatKind, FormatKind.Group>;
type Format = FormatType | FormatLiteral | FormatAndNext | FormatMaybeNext | FormatOr | FormatRepeat;
interface FormatType {
    kind: FormatKind.Type,
    range: vscode.Range,
    type: ParameterType,
}
interface FormatLiteral {
    kind: FormatKind.Literal,
    // Range includes quotation marks.
    range: vscode.Range,
    // Does not include quotation marks.
    value: string,
}
interface FormatAndNext {
    kind: FormatKind.AndNext,
    range: vscode.Range,
    left: Format,
    right: Format,
}
interface FormatMaybeNext {
    kind: FormatKind.MaybeNext,
    range: vscode.Range,
    // If left is not set then it is unary
    left?: Format,
    right: Format,
}
interface FormatOr {
    kind: FormatKind.Or,
    range: vscode.Range,
    left: Format,
    right: Format,
}
interface FormatRepeat {
    kind: FormatKind.Repeat,
    range: vscode.Range,
    right: Format,
}

export function formatHas(format: Format, needle: Format): boolean {
    if (compareFormat(format, needle)) {
        return true;
    }

    if (format.kind === FormatKind.AndNext || format.kind === FormatKind.Or) {
        return formatHas(format.left, needle) || formatHas(format.right, needle);
    } else if (format.kind === FormatKind.MaybeNext) {
        return (format.left !== undefined && formatHas(format.left, needle)) || formatHas(format.right, needle);
    } else if (format.kind === FormatKind.Repeat) {
        return formatHas(format.right, needle);
    } else {
        // If this was a Type or Literal then we already compared them at the start of the function
        // and they weren't equal, thus this branch does not have the needle.
        return false;
    }
}

/**
 * Recursively compare formats for equivalence.
 * Ignores the range, only cares about the structure.
 * Note that it doesn't try to be very complex to see if they have the same meanings, just
 * equivalent parsed structure. (Ex: `a &+ b |+ c` is the same as `a &+ (b |+ c)`) but they'd
 * parse differently and so are not equal by this function.
 */
export function compareFormat(left: Format, right: Format): boolean {
    if (left === right) {
        // Early exit for easy equivalence.
        return true;
    }

    if (left.kind === FormatKind.Type && right.kind === FormatKind.Type) {
        // Since these are objects from the global, they should be equivalent if they are the same.
        return left.type === right.type;
    } else if (left.kind === FormatKind.Literal && right.kind === FormatKind.Literal) {
        return left.value === right.value;
    } else if (left.kind === FormatKind.AndNext && right.kind === FormatKind.AndNext) {
        return compareFormat(left.left, right.left) && compareFormat(left.right, right.right);
    } else if (left.kind === FormatKind.MaybeNext && right.kind === FormatKind.MaybeNext) {
        if (left.left === undefined || right.left === undefined) {
            return left.left === right.left && compareFormat(left.right, right.right);
        } else {
            return compareFormat(left.left, right.left) && compareFormat(left.right, right.right);
        }
    } else if (left.kind === FormatKind.Or && right.kind === FormatKind.Or) {
        return compareFormat(left.left, right.left) && compareFormat(left.right, right.right);
    } else if (left.kind === FormatKind.Repeat && right.kind === FormatKind.Repeat) {
        return compareFormat(left.right, right.right);
    } else {
        // Unequal kind
        return false;
    }
}

/**
 * Check if this is an argument that should always be allowed.
 * This means: Variables, Accesses to settings, Accesses to setup, and expressions.
 * This is done because we can't prove what values they have and so have to simply allow them,
 * especially since they're so common.
 * @param arg The argument to check
 */
function isAlwaysArgument(arg: Arg): arg is (VariableArgument | SettingsSetupAccessArgument | ExpressionArgument) {
    if (arg === undefined) return false;
    // Note: we don't include empty expressions since those are trivially not allowed.
    return arg.type === ArgType.Variable || arg.type === ArgType.SettingsSetupAccess || arg.type === ArgType.Expression;
}

/**
 * Format the tree as a.. tree. In text. Good for getting a better view of it from a reasoning level
 * @param format The input tree.
 * @param indent The amount of types [rep] should be indented.
 * @param rep The text to use to indent. Can be set to an empty string for no indent
 */
function formatToTree(format: Format, indent: number = 0, rep: string = ' '): string {
    const prefix = rep.repeat(indent);
    if (format.kind === FormatKind.Type) {
        return `${prefix}Type::${format.type.name[0]}\n`;
    } else if (format.kind === FormatKind.Literal) {
        return `${prefix}'${format.value}'\n`;
    } else if (format.kind === FormatKind.AndNext) {
        return `${prefix}AndNext\n${formatToTree(format.left, indent + 1, rep)}${formatToTree(format.right, indent + 1, rep)}`;
    } else if (format.kind === FormatKind.MaybeNext) {
        if (format.left) {
            return `${prefix}MaybeNext\n${formatToTree(format.left, indent + 1, rep)}${formatToTree(format.right, indent + 1, rep)}`;
        } else {
            return `${prefix}AndNext\n${formatToTree(format.right, indent + 1, rep)}`;
        }
    } else if (format.kind === FormatKind.Or) {
        return `${prefix}Or\n${formatToTree(format.left, indent + 1, rep)}${formatToTree(format.right, indent + 1, rep)}`;
    } else if (format.kind === FormatKind.Repeat) {
        return `${prefix}Repeat\n${formatToTree(format.right, indent + 1, rep)}`;
    } else {
        return `${prefix}UNHANDLED KIND`;
    }
}

/**
 * Formats it as a simple text, for relatively easy checking of how operator precedence is performed
 * @param format The input tree.
 */
function formatToString(format: Format): string {
    if (format.kind === FormatKind.Type) {
        return format.type.name[0];
    } else if (format.kind === FormatKind.Literal) {
        return `'${format.value}'`;
    } else if (format.kind === FormatKind.AndNext) {
        // We use {} instead of () to disambiguate from actual parentheses
        return `{${formatToString(format.left)} &+ ${formatToString(format.right)}}`;
    } else if (format.kind === FormatKind.MaybeNext) {
        if (format.left) {
            return `{${formatToString(format.left)} |+ ${formatToString(format.right)}}`;
        } else {
            return `{|+ ${formatToString(format.right)}}`;
        }
    } else if (format.kind === FormatKind.Or) {
        return `{${formatToString(format.left)}|${formatToString(format.right)}}`;
    } else if (format.kind === FormatKind.Repeat) {
        return `...{${formatToString(format.right)}}`
    } else {
        return `{UNHANDLED KIND}`;
    }
}