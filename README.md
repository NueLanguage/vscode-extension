# Nue for Visual Studio Code

Syntax highlighting and basic editing support for the current Nue language.

Literally do not expect anything else from this extension at the moment.

## Preview

Open this repository in VS Code and press F5 to launch **Preview Nue highlighting**.
The development window opens the representative Nue source example.

Use **Developer: Inspect Editor Tokens and Scopes** to inspect the grammar scopes
and the colours chosen by your current theme.

## Check and package

Development checks use Node.js 22 or newer:

```sh
npm ci
npm test
npm run package
```

Packaging creates a vsix file, which can be installed with **Extensions: Install from VSIX...**, or:

```sh
code --install-extension ./nue-vscode-0.1.0.vsix
```

Optionally check tokenisation against a Nue compiler checkout:

```sh
NUE_SOURCE_ROOT=/path/to/nue npm test
```

This reads its examples and standard packages; it does not execute their code.
