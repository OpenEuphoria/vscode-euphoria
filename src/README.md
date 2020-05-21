# vscode-euphoria

## Extension

### Document Symbol Provider

The document symbol provider parses the provided document looking for line-based regex patterns and
then returns a list of symbols marking various parts of the document for ouline-based navigation.

Since Euphoria isn't an object-oriented language, it doesn't really have a lot of hierarchy to work
with. Here are the basic rules that will be applied:

1. If the document has a namespace that becomes the single root element.
2. All public/export/global functions/procedures/types and constants/simple enums will be listed.
3. Any public/export/global enum types will be listed, with their member symbols listed inside.

The parsing engine is pretty basic and makes heavy use of regular expressions. There are bound to
be errors and probably some missed symbles here and there. Please open a new issues if you find
anything out of place.
