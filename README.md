# Nue for Visual Studio Code

Syntax highlighting and formatting support for the current Nue language.

Literally do not expect anything else from this extension at the moment.

## Formatting

The extension looks for
`nue` on the extension host's PATH unless `nue.executablePath` overrides it.

```json
{
 "nue.executablePath": "/absolute/path/to/nue",
 "[nue]": {
  "editor.defaultFormatter": "NueLanguage.nue-vscode",
  "editor.formatOnSave": true
 }
}
```

For Remote SSH or containers, the executable
must be available on that workspace's extension host.

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
code --install-extension ./nue-vscode-a.b.c.vsix
```

Optionally check tokenisation against a Nue compiler checkout:

```sh
NUE_SOURCE_ROOT=/path/to/nue npm test
```

This reads its examples and standard packages; it does not execute their code.

Set `NUE_EXECUTABLE` to enable the optional real compiler process check in `npm test`.
For the full editor check, set it along with `VSCODE_EXECUTABLE` (the VS Code
application executable) and run `npm run test:editor`.
