import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

export const cliPaths = ["canonical", "directory link", "file link"];
export const cliFlags = [[], ["--preserve-symlinks-main"]];

export function cliFixture(t, moduleUrl) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "npm cli % # "));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const home = path.join(root, "home");
	const work = path.join(root, "work");
	fs.mkdirSync(home);
	fs.mkdirSync(work);
	const canonical = fileURLToPath(moduleUrl);
	const directoryLink = path.join(root, "installed skill");
	fs.symlinkSync(path.dirname(canonical), directoryLink, "dir");
	const directoryChain = path.join(root, "skill link chain");
	fs.symlinkSync(directoryLink, directoryChain, "dir");
	const fileLink = path.join(root, "helper link.mjs");
	fs.symlinkSync(canonical, fileLink);
	const fileChain = path.join(root, "helper link chain.mjs");
	fs.symlinkSync(fileLink, fileChain);
	const scripts = {
		canonical,
		"directory link": path.join(directoryChain, path.basename(canonical)),
		"file link": fileChain,
	};
	// Even a regression must not reach an installed npm/op or a real registry.
	const guard = path.join(root, "offline-guard.mjs");
	fs.writeFileSync(guard, `
import childProcess from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
const deny = () => { throw new Error("unexpected external auth/registry boundary"); };
for (const key of ["exec", "execSync", "execFile", "execFileSync", "spawn", "spawnSync", "fork"]) childProcess[key] = deny;
http.request = http.get = https.request = https.get = deny;
net.connect = net.createConnection = net.Socket.prototype.connect = deny;
globalThis.fetch = deny;
syncBuiltinESMExports();
`);
	return {
		root,
		work,
		scripts,
		run(args, input = "") {
			const result = spawnSync(process.execPath, ["--import", pathToFileURL(guard).href, ...args], {
				cwd: work,
				env: { HOME: home, PATH: "", TMPDIR: root, LANG: "C" },
				input,
				encoding: "utf8",
				timeout: 5_000,
				maxBuffer: 1024 * 1024,
			});
			assert.ifError(result.error);
			assert.equal(result.signal, null);
			return result;
		},
	};
}

export function testCliEntrypoint(moduleUrl, diagnostic) {
	const name = path.basename(fileURLToPath(moduleUrl));
	for (const link of cliPaths) {
		for (const flags of cliFlags) {
			test(`${name}: ${link} ${flags.join(" ")} executes main`, (t) => {
				const fixture = cliFixture(t, moduleUrl);
				const result = fixture.run([...flags, fixture.scripts[link]]);
				assert.equal(result.status, 1, "invalid invocation must not silently succeed");
				assert.equal(result.stdout, "");
				assert.equal(result.stderr, `${diagnostic}\n`);
			});
		}
	}
	for (const mode of ["another script", "absent argv", "non-file argv"]) {
		test(`${name}: imports with ${mode} stay inert`, (t) => {
			const fixture = cliFixture(t, moduleUrl);
			for (const script of Object.values(fixture.scripts)) {
				const code = `await import(${JSON.stringify(pathToFileURL(script).href)});`;
				let args;
				if (mode === "another script") {
					const importer = path.join(fixture.work, "importer.mjs");
					fs.writeFileSync(importer, code);
					args = [importer];
				} else {
					args = ["--input-type=module", "-e", code];
					if (mode === "non-file argv") args.push("not-a-file");
				}
				for (const flags of cliFlags) {
					const result = fixture.run([...flags, ...args]);
					assert.equal(result.status, 0);
					assert.equal(result.stdout, "");
					assert.equal(result.stderr, "");
				}
			}
		});
	}
}
