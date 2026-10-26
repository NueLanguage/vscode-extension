const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const vscode = require("vscode");

async function run() {
	await vscode.workspace.getConfiguration("nue").update("executablePath", process.env.NUE_EXECUTABLE, vscode.ConfigurationTarget.Global);
	await vscode.workspace.getConfiguration().update("[nue]", {
		"editor.defaultFormatter": "NueLanguage.nue-vscode",
		"editor.formatOnSave": true
	}, vscode.ConfigurationTarget.Global);
	const document = await vscode.workspace.openTextDocument(vscode.Uri.file(process.env.NUE_EDITOR_FILE));
	assert.equal(document.languageId, "nue");
	const extension = vscode.extensions.getExtension("NueLanguage.nue-vscode");
	assert.ok(extension);
	await extension.activate();
	const editor = await vscode.window.showTextDocument(document);
	const original = await fs.readFile(process.env.NUE_EDITOR_FILE, "utf8");
	const input = "package main\nfunc answer()int{return 42;}\n";
	const expected = "package main\n\nfunc answer() int { return 42 }\n";
	const whole = () => new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
	await editor.edit(edit => edit.replace(whole(), input));
	assert.equal(await fs.readFile(process.env.NUE_EDITOR_FILE, "utf8"), original);
	const edits = await vscode.commands.executeCommand("vscode.executeFormatDocumentProvider", document.uri, { tabSize: 4, insertSpaces: false });
	assert.ok(edits?.length);
	const change = new vscode.WorkspaceEdit();
	change.set(document.uri, edits);
	assert.equal(await vscode.workspace.applyEdit(change), true);
	assert.equal(document.getText(), expected);
	assert.equal(await fs.readFile(process.env.NUE_EDITOR_FILE, "utf8"), original);
	await vscode.commands.executeCommand("undo");
	assert.equal(document.getText(), input);
	const settings = vscode.workspace.getConfiguration("editor", { uri: document.uri, languageId: "nue" });
	assert.equal(settings.get("formatOnSave"), true);
	const saved = new Promise(resolve => {
		const listener = vscode.workspace.onDidSaveTextDocument(current => {
			if (current.uri.toString() === document.uri.toString()) { listener.dispose(); resolve(); }
		});
	});
	await vscode.commands.executeCommand("workbench.action.files.save");
	await saved;
	assert.equal(document.getText(), expected);
	assert.equal(await fs.readFile(process.env.NUE_EDITOR_FILE, "utf8"), expected);
	console.log("VS Code formatting provider, unsaved text, undo and format-on-save passed.");
}

module.exports = { run };
