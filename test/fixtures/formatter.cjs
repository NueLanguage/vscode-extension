#!/usr/bin/env node
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["fmt", "-"])) process.exit(4);
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
	const request = JSON.parse(input);
	setTimeout(() => {
		if (request.error) process.stderr.write(request.error);
		if (request.output) process.stdout.write(request.output);
		process.exitCode = request.code || 0;
	}, request.delay || 0);
});
