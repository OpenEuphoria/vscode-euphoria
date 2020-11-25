# vscode-euphoria

## Extension

### Document Symbol Provider

The document symbol provider parses the provided document looking for line-based regex patterns and then returns a list of symbols marking various parts of the document for outline-based navigation.

Since Euphoria isn't an object-oriented language, it doesn't really have a lot of hierarchy to work with. Here are the basic rules that will be applied:

1. If the document has a namespace that becomes the single root element.
2. All public/export/global functions/procedures/types and constants/simple enums will be listed.
3. Any public/export/global enum types will be listed, with their member symbols listed inside.

The parsing engine is pretty basic and makes heavy use of regular expressions. There are bound to be errors and I probably some missed symbles here and there. Please open a new issues if you find anything out of place.

### Diagnostics Provider

The extension will automatically check your code for errors under two conditions:

1. Whenever an editor is *first* activated, either by opening a new document, or by switching to a tab for the first time.
2. Whenever a document is saved.

In order for the extension to check your code for errors, it will:

- Run your document via `eui -batch -test ${filename}`.
- If there are any errors in the document, `eui` will exit with a non-zero result.
- The extension will then open the `ex.err` file and read the error information out of the first few lines.

**NOTE:** This means your `ex.err` will be continuously overwritten while you are saving and naviaging your code! If you do not want this behavior, you can disable diagnostics via **File** > **Preferences** > **Settings** > **Extensions** > **Euphoria**.
