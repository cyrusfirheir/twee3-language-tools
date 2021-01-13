# Parameters & Arguments Validations
In the extension, there is two steps of validations. That of parsing the arguments to the macros to ensure sanity in syntax (ex: checking for closing quotation marks on strings), and then validating the types.  
This document goes over some high-level details of how it works, and how to use it with the extension.  
  
## Argument Parsing
**Supported**: Sugarcube 2

The extension uses code from SugarCube (modified in some manners) to parse the arguments faithfully. This allows for realizing errors with syntax before the script you wrote is executed by SugarCube, making so you won't accidentally run into the issue of having some obviously incorrect syntax.
```html
<<link "Hello!>>
```
Will provide a diagnostic at the end of the macro, because there is no closing quotation mark on the string and those are required.
The same exists for Twine links that are passed as arguments, of the `[[Text->Passage]]`, `[[Passage]]`, or `[[Text|Passage]]` double-bracket form.
```html
<<link [Text->Passage]>>
```
Will provide a diagnostic at the start of the link, telling you that it is malformed.

Now, this is useful and helps catch bugs, making so you have to spend less time manually loading passages for testing, but what about macros that do *fancy* custom argument parsing? Such as `<<set>>`, `<<switch>>`, `<<for>>` and more?
These have `skipArgs` set on their definitions, example macro that doesn't want its argument's syntax to be checked (using JSON, but the same applies to YAML):
```
"fancy": {
    "name": "fancy",
    "description": "Performs fancy text manipulation!",
    "skipArgs": true
}
```
This would make so the extension does not check the arguments for validity, since the macro may be doing whatever it wants with them rather than relying on the default SugarCube argument parsing.  

Thankfully, most macros use the simple argument parsing and so `skipArgs` defaults to `false` (allowing it to automatically parse them).

## Parameter Types
**Supported**: Sugarcube 2  

Parameter types are a method for specifying the 'types' of the arguments that can be passed into a macro.

If you were to look at: [Linkreplace](http://www.motoslave.net/sugarcube/2/docs/#macros-macro-linkreplace).
You would see that it is pretty simple. It takes in `linkText` and then an optional `transition`/`t8n` (those two are equivalent).  
Now, if you were to write:
```html
<<linkreplace>>Testing<</linkreplace>>
```
Well, this is obviously incorrect. We need to provide at least one argument. Sadly, our previous argument validation simply checks if the arguments are valid, not if they are valid arguments.  
Then there is cases like:
```html
<<linkreplace [[Text->Passage]]>>Testing<</linkreplace>>
```
This doesn't make any sense, and would result in an unpleasant error (Note: as of v2.33.4 this simply appears as `[object Object]` due to it not being handled as an error!).  
Then there is the case of too many arguments:
```html
<<linkreplace Alpha beta zeta>>Testing<</linkreplace>>
```
Where it is most certainly an error to do this, and it might be hard to notice! You likely meant to do:
```html
<<linkreplace "Alpha beta zeta">>Testing<</linkreplace>>
```
Then there is simple misspellings:
```html
<<linkreplace Alpha transiton>><</linkreplace>>
```
You might notice this if you're using a spell checker (There are extensions for that which work pretty well!), but then you might have gotten used to using `t8n` (the shorthand) and then accidentally wrote `tn8`, which your spellchecker likely won't catch.

So, to resolve these cases:
- Too few parameters
- Invalid parameter types
- Too many parameters
- Misspellings of literal parameters
- And more

We have a way of specifying the types of the values a macro could receive, which is done - as usual - within the file which defines all of the macros that your project has:
A field named `"parameters"` specifies all of the possible variants (which can be roughly thought of as overloads in some programming languages).  
Here is how one might implement the `linkreplace` macro.
```json
"linkreplace": {
    "name": "linkreplace",
    "parameters": {
        // The name of the variant and its format.
        "primary": "text |+ 'transition'|'t8n'"
    }
}
```
Now, this likely looks a bit arcane.  
The simplest part is the first element of the array: `"text"`, what is this?  
This is a **parameter type**, which is one of many different types which specify what can be used as a parameter. These are used to validate the parameters given at that position within the macro's arguments. See the [Parameter Types](#parameter-types) section for more details on the exact types available.
So, this can be any text. (or a variable/expression! See [Parameter Types Warning](#parameter-types-warning))  
This, will make so doing:
```html
<<linkreplace [[Text->Passage]]>>
```
is now invalid! As well, it will make so the empty case, `<<linkreplace>>` is also invalid. We'll get warnings on both.  
Now, we need to talk about the spooky `|+ 'transition'|'t8n'` syntax.  
First, let's just look at: `'transition'`. These quotes around it mean it is a literal, in that we might literally type it, ex:
```html
<<linkreplace "Go Home" transition>>
```
**Note**: One could also use quotes here, `"transition"` becoming the same thing, the macro not caring whatsoever. A variable could also be used here. (See the [Parameter Types Warning](#parameter-types-warning)).  
So, this lets us specify very specific parameters that are not generic parameter types.  
Next, the `|`. This bar is called the 'or operator', and in `a|b` says "This argument is either *a* or it is *b*".  
**Note**: It could be both as well! Either, because the left side and the right side are equivalent: `bool|bool` or they intersect `bool|false`.  
The left side and the right side could be **parameter types** or **literals** (they can both be different as well!). So, in the case of `'transition'|'t8n'`, it is merely saying "This argument is either 'transition' or 't8n'".  
**Note**: This is *chainable*. You can do `'transition'|'t8n'|'animate'|'fancy'|bool` and it will match any of those.  
Next we have the.. weird `|+` syntax. You might have guessed this makes the value optional based on the documentation, but what is its exact meaning?  
Well, this operator, `|+` is called "maybe-next". As you might have guessed, this makes so that the "next" argument is validated if it occurs, otherwise it doesn't have to appear. So, if there's a second parameter, then it must be `transition` or `t8n`.  
See: [Operators](#operators) for a full list, descriptions and examples of the various operators.



### Parameter Types
There are a number of parameter types:
- `bool`: A value that is either `true` or `false`.
    - `true`: true literal value.
    - `false`: false literal value.
- `null`: A null literal value.
- `undefined`: An undefined literal value.
- `number`: A value that is some number. (`2`, `4.2`, `3.14159`, `-9.3`). We don't allow `NaN` in this position, since usually that is not intended to be allowed.
- `NaN`: A literal `NaN`. Most often combined with `number`: `number|NaN`.
- `link`: A link in the [Twine syntax](http://www.motoslave.net/sugarcube/2/docs/#markup-link): `[[Text->Passage]]`, `[[Passage]]`, `[[Text|Passage]]`, etc. Allows setter.
    - `linkNoSetter`: A link that does not allow the setter syntax (`[[Passage][$wentToPassage = true]]`). Most notably required by the `<<link>>` macro.
- `image`: An image in the [Twine syntax](http://www.motoslave.net/sugarcube/2/docs/#markup-image): `[img[Image]]`, `[img[Image][Passage]]`, etc.
    - `imageNoSetter`: An image that does not allow the setter syntax (`[img[Image][Passage][$clickedImage = true]]`). Most notably required by the `<<link>>` macro.
- `bareword`: A word that is on its own. Ex: `<<ex Alpha>>` (value: `Alpha`).
- `string`: A quoted string. You may want to use `text` instead. Ex: ``
- `text`: Arbitrary text, quoted or not. Includes much of the above (except for links/images). Ex: `<<ex test>>` (text: `test`), `<<ex "lorem ipsum">>` (text: `lorem ipsum`), `<<ex 24.9>>` (text: `24.9`).
- `passage`: A passage name. (Note: Not currently verified to be valid).
There are more proposed parameter types that may be implemented at a future data, if you have suggestions for useful types, please open an issue on the Github repository.

#### Parameter Types Warning
One should not rely on Parameter Types completely. All parameter types can be replaced with a: variable, access to settings, access to setup, or expression. Since the extension does not come with a supercomputer, it can not check if variables passed into macros will have sane values.  
`<<link $value>>`. The extension *cannot* tell whether this is a `string`, a `link` object, a `number` or even a javascript function. Even simple cases, such as:
```html
<<set $value to "Go Home">>
<<link $value>><</link>>
```
*Cannot* be checked for.

### Operators
#### Or `|`
The `or` operator is the lone pipe `|` (it is distinct from the [Maybe-Next](#maybe-next) operator), and it simply means "This or that".  
Example 1: `'a'|'b'`. Which simply means that the argument could be the literal `'a'` or the literal `'b'`. Anything else (remember the [Parameter Types Warning](#parameter-types-warning)!) is an error.  
Example 2: `'death'|number` (for, perhaps a damage macro that takes HP or if it should be an instant kill). This is an example of using a literal or a parameter type.  
Example 3: `'a'|'b'|'c'|'d'|'e'` You can chain the `or` operator repeatedly to make it `a` or `b` or `c` or `d` or `e`.  
Example 4: `true|true`, `bool|true`. You can have values that intersect, if you wish, and it works just fine.  
Example 5: This binds 'tighter' than other operators, meaning that `'a' &+ '1'|'2'|'3'` is interpreted as `'a' &+ ('1'|'2'|'3')`.
#### And-Next `&+`
The `and-next` operator is the ampersand with a plus, `&+`, which represents a requirement that the next argument exists for this part of the format to be valid.  
Example 1: `'a' &+ 'b'` `a` must be followed by `b`. Ex: `<<ex a b>>`.  
Example 2: It can be chained as usual, `'a' &+ 'b' &+ 'c'`. Ex: `<<ex a b c>>`  
Example 3: Using it with a mix of parameter types and literals is completely allowed. `text &+ 'still'|'shake'|'shatter'`. Ex: `<<ex blah shake>>`, `<<ex "Testing This Macro" shatter>>`, etc.
#### Maybe-Next `|+`
The `maybe-next` operator is the pipe with a plus, `|+`, which represents a *next argument* that may or may not exist.  
Example 1: `'a' |+ 'b'`. This would mean a literal `'a'` that could be (but doesn't have to be) followed by a `'b'`. (Ex: `<<ex a>>`, or `<<ex a b>>` are (roughly) allowed).  
Example 2: `|+ 'b'`. It can be used to implement "empty or something" arguments. (Ex: `<<ex>>` or `<<ex b>>`)  
Example 3: Ambiguity. You may run into ambiguous situations like: `'a' |+ 'b' &+ 'c'`. This is _not_ parsed left-to-right. the `and-next` operator binds 'harder' than `maybe-next`, and so it is equivalent to `'a' |+ ('b' &+ 'c')`. (ex: `a` or `a b c`) If you want it to be bound around the `maybe-next`, then do: `('a' |+ 'b') &+ 'c'` (ex: `a c` or `a b c`).
#### Repeat
The `repeat` operator is three periods, `...`, which is used for repeating elements zero or more times.  
Due to limitations in parsing, this *must* only be a part of the last part.  
Example 1: `...'a'`. Ex: `<<ex>>`, `<<ex a>>`, `<<ex a a a a a a a a a a a a>>`, etc.  
Example 2: `...text`. Ex: `<<ex>>`, `<<ex Hello>>`, `<<ex Hello world, this is a test.>>`, etc.  
Example 3: `...'a'|'b'`. The `repeat` operator binds looser than the `or` operator, so this is interpreted as `...('a'|'b')`. Ex: `<<ex>>`, `<<ex a>>`, `<<ex b>>`, `<<ex a a a b b a a a a a b>>`, etc.  
Example 4: `text &+ ...text`. This is a common pattern which you would do if you want one or more entries. Ex: `<<ex Hello>>`, `<<ex Testing this macro.>>`, `<<ex "Blah blah blah." Testing.>>`  
#### Grouping
Grouping is done with parentheses, and is much like using parentheses in math or programming to group operators.  
It can also be used for making things clearer and explicit if you don't entirely get the format string syntax.  
Example 1: `('a')`. Equivalent to `'a'`.  
Example 2: `('a'|'b')`. Equivalent to `'a'|'b'`.  
Example 3: `('a' &+ 'b')`, `'a' &+ ('b')`, etc. I think you get the picture.  
Example 4: `'a' (&+ 'b')` is valid, and is equivalent to the original.  
Example 5: `'a' (&+) 'b'`. A syntax error.  
Example 7: You may run into ambiguous situations like: `'a' |+ 'b' &+ 'c'` where you want `a` *or* `abc`. The given code would lead to `ac` *or* `abc`. Such a solution would be: `'a' |+ ('b' &+ 'c')`