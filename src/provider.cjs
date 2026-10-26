const { invokeFormatter, replacement } = require("./format.cjs");

function createFormatter(vscode, output, run = invokeFormatter) {
	const running = new Map();
	const notified = new Set();

	function report(message, key) {
		output.appendLine(message);
		if (!key || notified.has(key)) return;
		notified.add(key);
		void vscode.window.showErrorMessage(message);
	}

	return {
		async provideDocumentFormattingEdits(document, options, token) {
			if (token.isCancellationRequested) return [];
			if (!vscode.workspace.isTrusted) {
				report("Nue formatting requires a trusted workspace. Syntax highlighting remains available.", "trust");
				return [];
			}
			const configured = vscode.workspace.getConfiguration("nue", document.uri).get("executablePath", "");
			const executable = configured || "nue";
			const key = document.uri.toString();
			running.get(key)?.abort();
			const controller = new AbortController();
			running.set(key, controller);
			const cancellation = token.onCancellationRequested(() => controller.abort());
			const version = document.version;
			const source = document.getText();
			try {
				const formatted = await run(executable, source, { signal: controller.signal });
				if (controller.signal.aborted || document.isClosed || document.version !== version) return [];
				notified.delete(`tool:${executable}`);
				const edit = replacement(source, formatted);
				if (!edit) return [];
				const range = new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end));
				return [vscode.TextEdit.replace(range, edit.text)];
			} catch (error) {
				if (controller.signal.aborted || document.isClosed || document.version !== version) return [];
				if (error.code === "ENOENT" || error.code === "EACCES") {
					report(`Cannot run Nue executable '${executable}'. Add nue to the extension host's PATH or set nue.executablePath. ${error.message}`, `tool:${executable}`);
				} else {
					report(`${key}: ${error.message}`);
				}
				return [];
			} finally {
				cancellation.dispose();
				if (running.get(key) === controller) running.delete(key);
			}
		},
		dispose() {
			for (const controller of running.values()) controller.abort();
			running.clear();
		}
	};
}

module.exports = { createFormatter };
