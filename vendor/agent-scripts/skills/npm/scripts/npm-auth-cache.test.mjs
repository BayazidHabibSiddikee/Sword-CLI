import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
	cliFixture,
	cliFlags,
	cliPaths,
	testCliEntrypoint,
} from "./npm-cli-test-helpers.mjs";
import {
	registryTokenFromNpmrc,
	registryTokenMatches,
	updateRegistryToken,
} from "./npm-auth-cache.mjs";

const moduleUrl = new URL("./npm-auth-cache.mjs", import.meta.url);
testCliEntrypoint(
	moduleUrl,
	"usage: npm-auth-cache.mjs <update|verify> <npmrc> [registry]",
);

for (const link of cliPaths) {
	for (const flags of cliFlags) {
		test(`cache round-trip: ${link} ${flags.join(" ")}`, (t) => {
			const fixture = cliFixture(t, moduleUrl);
			const npmrc = path.join(fixture.work, "synthetic npmrc");
			const token = "npm_synthetic_new==";
			fs.writeFileSync(npmrc, `//registry.example.invalid/:_authToken=${token}\n`, {
				mode: 0o600,
			});
			const item = {
				id: "synthetic-item",
				fields: [
					{ id: "username", value: "synthetic-owner" },
					{
						id: "cache",
						label: "registry_token",
						type: "CONCEALED",
						value: "synthetic-old",
					},
				],
			};
			const invoke = (mode, input) => fixture.run(
				[...flags, fixture.scripts[link], mode, npmrc, "https://registry.example.invalid/"],
				input,
			);
			const updated = invoke("update", JSON.stringify(item));
			assert.equal(updated.status, 0);
			assert.equal(updated.stderr, "");
			const expected = structuredClone(item);
			expected.fields[1].value = token;
			assert.deepEqual(
				JSON.parse(updated.stdout), expected, "cache pipeline must emit the updated item",
			);
			const verified = invoke("verify", updated.stdout);
			assert.equal(verified.status, 0);
			assert.equal(verified.stdout, "");
			assert.equal(verified.stderr, "");
			const mismatch = invoke("verify", JSON.stringify(item));
			assert.equal(mismatch.status, 1);
			assert.equal(mismatch.stdout, "");
			assert.equal(
				mismatch.stderr, "cached registry token does not match the new npm session\n",
			);
		});
	}
}

test("extracts the exact registry token without truncating equals signs", () => {
	const token = registryTokenFromNpmrc(
		"//registry.npmjs.org/:_authToken=new-token==\n",
		"https://registry.npmjs.org/",
	);
	assert.equal(token, "new-token==");
});

test("updates only the unique registry token field", () => {
	const item = {
		fields: [
			{ id: "username", label: "username", value: "owner" },
			{ id: "cache", label: "registry_token", type: "CONCEALED", value: "old" },
		],
	};
	const updated = updateRegistryToken(structuredClone(item), "new");
	assert.equal(updated.fields[0].value, "owner");
	assert.equal(updated.fields[1].value, "new");
	assert.equal(updated.fields[1].type, "CONCEALED");
	assert.equal(registryTokenMatches(updated, "new"), true);
});

test("rejects missing or duplicate registry token fields", () => {
	assert.throws(() => updateRegistryToken({ fields: [] }, "new"), /exactly one/);
	assert.throws(
		() =>
			updateRegistryToken(
				{
					fields: [
						{ label: "registry_token", value: "one" },
						{ label: "registry_token", value: "two" },
					],
				},
				"new",
			),
		/exactly one/,
	);
});
