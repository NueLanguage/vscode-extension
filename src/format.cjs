const { execFile } = require("node:child_process");

function invokeFormatter(executable, source, { signal, timeout = 10000 } = {}) {
	return new Promise((resolve, reject) => {
		let inputError;
		const child = execFile(executable, ["fmt", "-"], {
			encoding: "utf8", signal, timeout, maxBuffer: 32 * 1024 * 1024,
			windowsHide: true, shell: false
		}, (error, stdout, stderr) => {
			if (error) {
				const message = error.killed && error.code === null && !signal?.aborted
					? "nue fmt timed out."
					: stderr.trim() || error.message;
				return reject(Object.assign(new Error(message), { code: error.code }));
			}
			if (inputError) return reject(inputError);
			if (!stdout) return reject(new Error("nue fmt returned no source text."));
			resolve(stdout);
		});
		child.stdin.on("error", error => { inputError = error; });
		child.stdin.end(source, "utf8");
	});
}

function unsafeBoundary(text, offset) {
	const left = text.charCodeAt(offset - 1), right = text.charCodeAt(offset);
	return left === 13 && right === 10 || left >= 0xD800 && left <= 0xDBFF && right >= 0xDC00 && right <= 0xDFFF;
}

function replacement(before, after) {
	if (before === after) return null;
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start++;
	if (unsafeBoundary(before, start) || unsafeBoundary(after, start)) start--;
	let end = before.length, nextEnd = after.length;
	while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
	if (unsafeBoundary(before, end) || unsafeBoundary(after, nextEnd)) { end++; nextEnd++; }
	return { start, end, text: after.slice(start, nextEnd) };
}

module.exports = { invokeFormatter, replacement };
