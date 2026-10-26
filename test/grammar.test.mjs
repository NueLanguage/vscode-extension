import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import textmate from "vscode-textmate";
import oniguruma from "vscode-oniguruma";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const wasm = await readFile(require.resolve("vscode-oniguruma/release/onig.wasm"));
await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));

const registry = new textmate.Registry({
	onigLib: Promise.resolve({
		createOnigScanner: patterns => new oniguruma.OnigScanner(patterns),
		createOnigString: value => new oniguruma.OnigString(value)
	}),
	loadGrammar: async scope => scope === "source.nue"
		? JSON.parse(await readFile(path.join(root, "syntaxes/nue.tmLanguage.json"), "utf8"))
		: null
});
const grammar = await registry.loadGrammar("source.nue");

function tokenise(source) {
	let state = textmate.INITIAL;
	const lines = source.split(/\r?\n/).map(line => {
		const result = grammar.tokenizeLine(line, state);
		state = result.ruleStack;
		return result.tokens.map(token => ({ ...token, text: line.slice(token.startIndex, token.endIndex) }));
	});
	return { lines, state };
}

function scope(source, spelling, expected, line = 0) {
	const offset = source.split(/\r?\n/)[line].lastIndexOf(spelling);
	assert.notEqual(offset, -1, `missing test spelling ${spelling}`);
	const token = tokenise(source).lines[line].find(token => token.startIndex <= offset && token.endIndex > offset);
	assert.ok(token?.scopes.includes(expected), `${spelling}: expected ${expected}, received ${token?.scopes}`);
}

test("range operators do not become decimal points", () => {
	const tokens = tokenise("for i in range 0..4 {}").lines[0];
	assert.deepEqual(tokens.filter(token => token.scopes.some(scope => scope.startsWith("constant.numeric"))).map(token => token.text), ["0", "4"]);
	scope("0..4", "..", "keyword.operator.range.nue");
	for (const number of ["0xFF_FF", "0b1010_0011", "0o755", "1_000", "1.25e-3", "1.", "2e+4"]) {
		const token = tokenise(number).lines[0][0];
		assert.equal(token.text, number);
		assert.ok(token.scopes.some(scope => scope.startsWith("constant.numeric")));
	}
});

test("strings, runes and escapes isolate code-looking contents", () => {
	scope('"func // ignored"', "func", "string.quoted.double.nue");
	scope('"func // ignored"', "//", "string.quoted.double.nue");
	scope(String.raw`"quote: \" newline: \n"`, String.raw`\"`, "constant.character.escape.nue");
	scope(String.raw`'\u03BB'`, String.raw`\u03BB`, "constant.character.escape.nue");
	scope(String.raw`"\q"`, String.raw`\q`, "invalid.illegal.escape.nue");
	scope('"unfinished\nreturn 0', "return", "keyword.control.nue", 1);
	scope("'unfinished\nreturn 0", "return", "keyword.control.nue", 1);
});

test("multiline comments preserve state, terminate and do not nest", () => {
	const source = "/* comment\nfunc hidden() {}\n*/\nreturn 0";
	scope(source, "func", "comment.block.nue", 1);
	scope(source, "return", "keyword.control.nue", 3);
	scope("/* outer /* inner */ return 0", "return", "keyword.control.nue");
	scope("//nue:build darwin && !linux", "nue:build", "keyword.control.directive.nue");
});

test("declarations, generic calls, attributes and foreign types", () => {
	scope("func Identity[T](value T) T {}", "Identity", "entity.name.function.nue");
	scope("func (value *Box[T]) Read() T {}", "Read", "entity.name.function.nue");
	scope("type Worker[T] func(value *T)", "Worker", "entity.name.type.nue");
	scope("type Worker[T] func(value *T) *Box[T]", "func", "storage.type.nue");
	scope("slices.Clone[[]uint16](values)", "Clone", "entity.name.function.call.nue");
	scope("Identity[Box[[2]uint8]](value)", "Identity", "entity.name.function.call.nue");
	scope("status mmio[uint16] @read at 0x04", "read", "storage.type.annotation.nue");
	scope("status mmio[uint16] @read at 0x04", "at", "keyword.operator.word.nue");
	scope('extern c from <stdint.h>', "stdint.h", "string.unquoted.header.nue");
	scope("value c.Size", "Size", "support.type.builtin.c.nue");
	scope("defer free(values)", "free", "support.function.builtin.nue");
	const indexed = tokenise("values[index]").lines[0];
	assert.ok(!indexed.some(token => token.scopes.includes("entity.name.function.call.nue")));
});

test("removed language constructs are not keywords", () => {
	const tokens = tokenise("function private while match any").lines[0];
	assert.ok(!tokens.some(token => token.scopes.some(scope => scope.startsWith("keyword.") || scope.startsWith("storage."))));
	scope("//# old block delimiter\nreturn 0", "return", "keyword.control.nue", 1);
});

test("representative source finishes without a leaked lexical context", async () => {
	const source = await readFile(path.join(root, "test/fixtures/highlighting.nue"), "utf8");
	assert.equal(tokenise(source).state.depth, 1);
});

test("block indentation avoids braces in ordinary strings and line comments", async () => {
	const configuration = JSON.parse(await readFile(path.join(root, "language-configuration.json"), "utf8"));
	const increase = new RegExp(configuration.indentationRules.increaseIndentPattern);
	const decrease = new RegExp(configuration.indentationRules.decreaseIndentPattern);
	assert.ok(increase.test("func main() {"));
	assert.ok(increase.test("if ready { // enter the block"));
	assert.ok(!increase.test('fmt.Println("{")'));
	assert.ok(!increase.test("// a comment with {"));
	assert.ok(!increase.test("func complete() {}"));
	assert.ok(decrease.test("\t} else {"));
});

test("real compiler examples and standard packages", { skip: !process.env.NUE_SOURCE_ROOT }, async t => {
	let count = 0;
	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) await visit(file);
			else if (entry.name.endsWith(".nue")) {
				assert.equal(tokenise(await readFile(file, "utf8")).state.depth, 1, file);
				count++;
			}
		}
	}
	await visit(path.join(process.env.NUE_SOURCE_ROOT, "examples"));
	await visit(path.join(process.env.NUE_SOURCE_ROOT, "std"));
	assert.ok(count > 0);
	t.diagnostic(`Tokenised ${count} real Nue source files`);
});
