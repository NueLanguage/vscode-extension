import assert from "node:assert/strict";
import { chmod, copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import formatter from "../src/format.cjs";

const fixture = fileURLToPath(new URL("fixtures/formatter.cjs", import.meta.url));

test("minimal edits preserve Unicode pairs and CRLF boundaries", () => {
	for (const [before, after] of [["abc", "aXXc"], ["😀", "😁"], ["x\r\ny", "x\ny"], ["\r\n", "\n"], ["abc", ""], ["", "abc"]]) {
		const edit = formatter.replacement(before, after);
		assert.equal(before.slice(0, edit.start) + edit.text + before.slice(edit.end), after);
	}
	assert.equal(formatter.replacement("same", "same"), null);
	assert.equal(formatter.replacement("😀", "😁").start, 0);
});

test("formatter process receives stdin and literal executable paths", { skip: process.platform === "win32" }, async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "nue formatter "));
	try {
		const executable = path.join(directory, "formatter with spaces");
		await copyFile(fixture, executable);
		await chmod(executable, 0o700);
		const output = "// Ω 😀\npackage main\n";
		assert.equal(await formatter.invokeFormatter(executable, JSON.stringify({ output })), output);
		await assert.rejects(formatter.invokeFormatter(executable, JSON.stringify({ code: 1, error: "syntax rejected" })), /syntax rejected/);
		await assert.rejects(formatter.invokeFormatter(executable, "{}"), /no source text/);
		await assert.rejects(formatter.invokeFormatter(path.join(directory, "missing"), ""), { code: "ENOENT" });
	} finally { await rm(directory, { recursive: true, force: true }); }
});

test("timeout and cancellation stop pending formatter processes", { skip: process.platform === "win32" }, async () => {
	const source = JSON.stringify({ delay: 10000, output: "late" });
	await assert.rejects(formatter.invokeFormatter(fixture, source, { timeout: 200 }), /timed out/);
	const controller = new AbortController();
	const pending = formatter.invokeFormatter(fixture, source, { signal: controller.signal });
	controller.abort();
	await assert.rejects(pending);
});

test("real prebuilt Nue formats unsaved source and rejects invalid source", { skip: !process.env.NUE_EXECUTABLE }, async () => {
	const source = "package main\nfunc f()int{return 42;}\n";
	assert.equal(await formatter.invokeFormatter(process.env.NUE_EXECUTABLE, source), "package main\n\nfunc f() int { return 42 }\n");
	await assert.rejects(formatter.invokeFormatter(process.env.NUE_EXECUTABLE, "package main\nfunc broken( {"), /error\[/);
});
