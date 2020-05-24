# vscode-euphoria

Euphoria language support and debugging for Visual Studio Code

## Features

### Declarative language features

These features are provided by configuration files like [`language-configuration.json`](language-configuration.json), [`euphoria.tmLanguage.json`](syntaxes/euphoria.tmLanguage.json), and [`snippets.json`](snippets/snippets.json).

- [x] Auto indentation
- [x] Bracket autoclosing
- [x] Bracket autosurrounding
- [x] Bracket matching
- [x] Code folding
- [x] Comment toggling
- [x] Snippet completion
- [x] Syntax highlighting

### Direct imeplementation features

These features are implemented directly inside the extension via [`extension.ts`](src/extension.ts).

- [x] Basic error checking
- [x] Basic symbol outline
- [ ] Debugger integration

### Language server features

These features will be implemented "remotely" using a Euphoria [language server](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide).

- [ ] Advanced code folding
- [ ] Advanced error checking
- [ ] Auto completion
- [ ] Auto formatting
- [ ] Code refactoring
- [ ] Hover information
- [ ] Jump to/peek definition

## Releases

### 1.3.0

- Added basic error check information (see [diagnostics provider](src/README.md#diagnostics-provider))
- Added a lot more comments to [`extension.ts`](src/extension.ts)
- Added configuration settings to disable diagnostics

### 1.2.1

- Fixed outline to skip block comments

### 1.2.0

- Added symbol outline provider
- Added basic indentation rules
- Added `.esp` to file extensions

### 1.1.1

- Fixed broken line in [`package.json`](package.json)

### 1.1.0

- Added a bunch of snippets (see [snippets](snippets/README.md))

### 1.0.0

- Initial release

