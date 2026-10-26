import assert from "node:assert/strict";
import { test } from "node:test";
import provider from "../src/provider.cjs";

function environment(executable = "") {
	const messages = [], log = [];
	const vscode = {
		workspace: { isTrusted: true, getConfiguration: () => ({ get: () => executable }) },
		window: { showErrorMessage: message => { messages.push(message); return Promise.resolve(); } },
		Range: class { constructor(start, end) { this.start = start; this.end = end; } },
		TextEdit: { replace: (range, text) => ({ range, text }) }
	};
	const document = { uri: { toString: () => "untitled:example.nue" }, version: 1, isClosed: false,
		getText: () => "unsaved", positionAt: offset => offset };
	const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
	return { vscode, document, token, messages, log, output: { appendLine: text => log.push(text) } };
}

test("provider uses current text, PATH fallback and an optional override", async () => {
	for (const executable of ["", "/prebuilt/nue with spaces"]) {
		const state = environment(executable);
		const formatter = provider.createFormatter(state.vscode, state.output, async (tool, source) => {
			assert.equal(tool, executable || "nue");
			assert.equal(source, "unsaved");
			return "formatted";
		});
		const edits = await formatter.provideDocumentFormattingEdits(state.document, {}, state.token);
		assert.equal(edits.length, 1);
		const edit = edits[0];
		const source = state.document.getText();
		assert.equal(source.slice(0, edit.range.start) + edit.text + source.slice(edit.range.end), "formatted");
		formatter.dispose();
	}
});

test("newer requests cancel old ones and stale document results are discarded", async () => {
	const state = environment();
	const requests = [];
	const formatter = provider.createFormatter(state.vscode, state.output, (tool, source, options) => new Promise(resolve => requests.push({ resolve, signal: options.signal })));
	const first = formatter.provideDocumentFormattingEdits(state.document, {}, state.token);
	const second = formatter.provideDocumentFormattingEdits(state.document, {}, state.token);
	assert.equal(requests[0].signal.aborted, true);
	requests[0].resolve("old");
	assert.deepEqual(await first, []);
	state.document.version++;
	requests[1].resolve("stale");
	assert.deepEqual(await second, []);
	formatter.dispose();
});

test("untrusted workspaces do not start an executable", async () => {
	const state = environment();
	state.vscode.workspace.isTrusted = false;
	const formatter = provider.createFormatter(state.vscode, state.output, () => assert.fail("must not execute"));
	assert.deepEqual(await formatter.provideDocumentFormattingEdits(state.document, {}, state.token), []);
	formatter.dispose();
});

test("missing executable warns once while syntax errors leave text unchanged", async () => {
	const state = environment();
	let code = "ENOENT";
	const formatter = provider.createFormatter(state.vscode, state.output, async () => { throw Object.assign(new Error("tool failed"), { code }); });
	for (let i = 0; i < 2; i++) assert.deepEqual(await formatter.provideDocumentFormattingEdits(state.document, {}, state.token), []);
	assert.equal(state.messages.length, 1);
	code = 1;
	assert.deepEqual(await formatter.provideDocumentFormattingEdits(state.document, {}, state.token), []);
	assert.equal(state.messages.length, 1);
	assert.equal(state.document.getText(), "unsaved");
	assert.equal(state.log.length, 3);
	formatter.dispose();
});
