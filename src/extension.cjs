const vscode = require("vscode");
const { createFormatter } = require("./provider.cjs");

function activate(context) {
	const output = vscode.window.createOutputChannel("Nue");
	const formatter = createFormatter(vscode, output);
	context.subscriptions.push(output, formatter,
		vscode.languages.registerDocumentFormattingEditProvider({ language: "nue" }, formatter));
}

module.exports = { activate };
