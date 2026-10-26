import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.NUE_EXECUTABLE || !process.env.VSCODE_EXECUTABLE) {
	throw new Error("Set NUE_EXECUTABLE to a prebuilt Nue binary and VSCODE_EXECUTABLE to the VS Code application executable.");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(path.join(os.tmpdir(), "nue-editor-check-"));
const workspace = path.join(directory, "workspace");
await mkdir(workspace);
const file = path.join(workspace, "main.nue");
await writeFile(file, "package main\n");
const environment = { ...process.env, NUE_EDITOR_FILE: file };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.NODE_OPTIONS;
const child = spawn(process.env.VSCODE_EXECUTABLE, [
	`--extensionDevelopmentPath=${root}`, `--extensionTestsPath=${path.join(root, "test/extension-host.cjs")}`,
	`--user-data-dir=${path.join(directory, "profile")}`, `--extensions-dir=${path.join(directory, "extensions")}`,
	"--disable-extensions", "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", workspace
], { env: environment, stdio: "inherit", detached: process.platform !== "win32" });
const timer = setTimeout(() => {
	if (process.platform === "win32") child.kill();
	else { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
}, 120000);
try {
	const status = await new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("close", code => resolve(code ?? 1));
	});
	if (status !== 0) throw new Error(`Editor checks failed; retained ${directory}`);
	await rm(directory, { recursive: true, force: true });
} finally { clearTimeout(timer); }
