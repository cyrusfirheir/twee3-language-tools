# Diagnostic regression tests

After installing the repository's dependencies, run:

```sh
npm test
```

`git-diff.test.cjs` runs the real TypeScript parsers, macro cache and diagnostic
updater with a small mock of the VS Code API and configuration/file I/O. It uses
the existing TypeScript and Lodash dependencies and Node's built-in test runner;
it does not require a running extension host.

Coverage includes working-tree/Git snapshots with identical paths and different
URIs, both opening orders, version-counter resets, cache reuse and cleanup,
snapshot-local passage ranges, and genuine parameter/container errors.

## Manual Git diff reproduction

1. Open a Git repository in VS Code with SugarCube 2 selected as the story format.
2. Commit a `.tw` file containing:

   ```twee
   :: Demo [widget]
   <<widget "one">>
   <<set $x to 1>>
   <</widget>>
   <<widget "two">>
   <<set $x to 2>>
   <</widget>>
   ```

3. Insert one blank line before the second widget and save without staging.
4. Open the file from Source Control in the diff editor. Before this fix, the
   macro cache can apply positions from one side to the other, producing false
   errors after the inserted line even though both documents are valid.
5. With the fix, neither side should report new errors. Switch between the normal
   editor and the diff, close/reopen the diff, and compare staged/history versions
   as well. Passage positions in the workspace should continue to use the working
   copy, not the historical snapshot.
6. Remove the name from `<<widget "two">>` or remove a closing `<</widget>>`.
   The real error should still be reported on the affected side.

Automated tests do not replace this manual editor check.
