import { execFile as execFileCallback, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { AwsClient } from 'aws4fetch';
import { sources } from './sources/index.mjs';

// Caches data/raw/ in a private R2 bucket, one snapshot per source per month, so reports rebuild without fetching everything again.
// Run by hand, never during a build.
// `npm run cache:synchronize` uploads local changes and fetches sources not yet fetched this month. See data/README.md.
const execFile = promisify(execFileCallback);
const ROOT = 'data/raw';
const PREFIX = 'data/raw';
const STATE = join(ROOT, '.sync.json');
const MANIFEST = `${PREFIX}/manifest.json`;
// Filled by hand or by paid runs, so they are never fetched, only uploaded when they change.
const MANUAL = ['bluesky', 'model-opinions'];
const FOLDERS = [...Object.keys(sources), ...MANUAL];
const IGNORED = /^(\.DS_Store|\._.*)$/;
// A source shrinking below this share of its last snapshot is more likely a bad fetch than real data.
const MIN_KEPT = 0.5;
const MAX_BUFFER = 2 ** 30;
// Sources whose API terms we could not confirm allow long retention only keep their latest snapshot.
const LATEST_ONLY = new Set(['stack-overflow']);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const pull = flag('--pull');
const seed = flag('--seed');
const replace = flag('--replace');
const forced = flag('--force') ? args.slice(args.indexOf('--force') + 1).filter((arg) => !arg.startsWith('--')) : [];
const unknownFlags = args.filter((arg) => arg.startsWith('--') && !['--pull', '--seed', '--replace', '--force', '--models'].includes(arg));
if (unknownFlags.length > 0) throw new Error(`Unknown flags: ${unknownFlags.join(', ')}`);
const notFetched = forced.filter((name) => !(name in sources));
if (notFetched.length > 0) throw new Error(`Can't fetch: ${notFetched.join(', ')}`);

const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) throw new Error('R2 is not configured, see .env.example');
const client = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });

const r2 = async (key, init) => {
	const response = await client.fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${key}`, init);
	if (!response.ok && response.status !== 404) throw new Error(`R2 ${init?.method ?? 'GET'} ${key}: HTTP ${response.status}`);
	return response;
};
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const put = async (key, body) => {
	const response = await r2(key, { method: 'PUT', body });
	if (!response.ok) throw new Error(`R2 PUT ${key}: HTTP ${response.status}`);
};

// Hashes contents and names only, because tarballs and file dates differ between otherwise equal copies.
const listFiles = async (dir) => {
	const files = [];
	for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
		if (IGNORED.test(entry.name)) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await listFiles(path)));
		else files.push(path);
	}
	return files;
};
const fingerprint = async (name) => {
	const dir = join(ROOT, name);
	const files = await listFiles(dir).catch(() => []);
	if (files.length === 0) return null;
	const hash = createHash('sha256');
	let bytes = 0;
	for (const file of files) {
		const data = await readFile(file);
		bytes += data.length;
		hash.update(`${file.slice(dir.length)}\0${sha256(data)}\n`);
	}
	return { hash: hash.digest('hex'), bytes };
};

const manifestResponse = await r2(MANIFEST);
const manifest = manifestResponse.ok ? await manifestResponse.json() : {};
await mkdir(ROOT, { recursive: true });
const state = await readFile(STATE, 'utf8').then(JSON.parse).catch(() => ({}));
const saveState = () => writeFile(STATE, `${JSON.stringify(state, null, '\t')}\n`);
const month = new Date().toISOString().slice(0, 7);
const problems = [];
const blocked = new Set();
const fail = (message) => {
	problems.push(message);
	console.error(message);
};

const restore = async (name) => {
	const { month: snapshot, sha256: expected, hash } = manifest[name];
	const key = `${PREFIX}/${snapshot}/${name}.tar.gz`;
	const response = await r2(key);
	if (!response.ok) throw new Error(`R2 GET ${key}: HTTP ${response.status}`);
	const archive = Buffer.from(await response.arrayBuffer());
	if (sha256(archive) !== expected) throw new Error(`${key}: checksum mismatch`);
	const temp = await mkdtemp(join(ROOT, '.restore-'));
	try {
		await writeFile(join(temp, 'archive.tar.gz'), archive);
		await execFile('tar', ['-xzf', 'archive.tar.gz'], { cwd: temp });
		await rm(join(ROOT, name), { recursive: true, force: true });
		await rename(join(temp, name), join(ROOT, name));
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
	state[name] = hash;
	await saveState();
	console.log(`${name}: restored ${snapshot}`);
};

const publish = async (name, { fetched = false, force = false } = {}) => {
	const local = await fingerprint(name);
	const previous = manifest[name];
	if (!local) throw new Error(`${name}: no data to upload`);
	if (local.hash === previous?.hash) {
		// Nothing new, so this month's run is recorded without storing a copy.
		if (fetched) {
			manifest[name] = { ...previous, fetched: month };
			await put(MANIFEST, JSON.stringify(manifest, null, '\t'));
		}
		return false;
	}
	if (previous && !force && local.bytes < previous.bytes * MIN_KEPT) {
		throw new Error(`${name}: shrank from ${previous.bytes} to ${local.bytes} bytes, use --force ${name} if that is correct`);
	}
	// COPYFILE_DISABLE keeps macOS from adding ._ files, which the data policy check rejects.
	const { stdout } = await execFile('tar', ['-czf', '-', '--exclude', '.DS_Store', '--exclude', '._*', '-C', ROOT, name], {
		encoding: 'buffer',
		maxBuffer: MAX_BUFFER,
		env: { ...process.env, COPYFILE_DISABLE: '1' },
	});
	await put(`${PREFIX}/${month}/${name}.tar.gz`, stdout);
	// The manifest is written last, so a failed upload leaves the previous snapshot in charge.
	manifest[name] = { month, hash: local.hash, sha256: sha256(stdout), bytes: local.bytes, size: stdout.length, fetched: fetched ? month : previous?.fetched };
	await put(MANIFEST, JSON.stringify(manifest, null, '\t'));
	if (LATEST_ONLY.has(name) && previous && previous.month !== month) await r2(`${PREFIX}/${previous.month}/${name}.tar.gz`, { method: 'DELETE' });
	state[name] = local.hash;
	await saveState();
	console.log(`${name}: uploaded ${month}, ${(stdout.length / 1e6).toFixed(1)} MB`);
	return true;
};

const checkPolicy = () => {
	const { status } = spawnSync(process.execPath, ['scripts/check-data-policy.mjs'], { stdio: 'inherit' });
	if (status !== 0) {
		console.error('Nothing more was uploaded, because the data policy check failed.');
		process.exit(1);
	}
};

if (seed && Object.keys(manifest).length > 0) throw new Error('--seed is only for an empty bucket');

// R2 wins when the local copy is missing or just out of date. Local changes are never overwritten without --replace.
for (const name of FOLDERS) {
	const entry = manifest[name];
	if (!entry) continue;
	const local = await fingerprint(name);
	if (local?.hash === entry.hash) state[name] = entry.hash;
	else if (!local || replace || state[name] === local.hash) await restore(name);
	else if (state[name] === entry.hash) console.log(`${name}: local changes${pull ? ' kept' : ''}`);
	else {
		blocked.add(name);
		fail(`${name}: differs from R2 and from the last sync, skipped. Use --replace to take the R2 copy.`);
	}
}
await saveState();

if (pull) {
	if (problems.length > 0) process.exitCode = 1;
	process.exit();
}

if (flag('--models')) {
	const { status } = spawnSync(process.execPath, ['scripts/model-opinions.mjs'], { stdio: 'inherit' });
	if (status !== 0) fail('model-opinions: the run failed');
}

let changed = false;
checkPolicy();
for (const name of FOLDERS.filter((folder) => !blocked.has(folder))) {
	if (!(await fingerprint(name))) continue;
	try {
		if (await publish(name, { fetched: seed, force: forced.includes(name) })) changed = !seed || changed;
	} catch (error) {
		blocked.add(name);
		fail(error.message);
	}
}

const due = Object.keys(sources).filter((name) => !blocked.has(name) && (forced.includes(name) || manifest[name]?.fetched !== month));
console.log(due.length > 0 ? `Fetching: ${due.join(', ')}` : `Every source is already fetched for ${month}`);
const results = await Promise.allSettled(due.map((name) => sources[name]()));
const fetched = due.filter((_, i) => results[i].status === 'fulfilled');
// A failed or rejected fetch can leave partial files behind, so the last snapshot goes back in its place.
const rollBack = async (name) => {
	if (manifest[name]) await restore(name);
};
for (const [i, name] of due.entries()) {
	if (results[i].status === 'fulfilled') continue;
	fail(`${name}: ${results[i].reason.message}`);
	await rollBack(name);
}
if (fetched.length > 0) checkPolicy();
for (const name of fetched) {
	try {
		if (await publish(name, { fetched: true, force: forced.includes(name) })) changed = true;
	} catch (error) {
		fail(error.message);
		await rollBack(name);
	}
}

if (changed) {
	const { status } = spawnSync(process.execPath, ['scripts/build-index.mjs'], { stdio: 'inherit' });
	if (status !== 0) fail('The index failed to build');
} else console.log('No new data, so the index was not rebuilt');

if (problems.length > 0) {
	console.error(`\n${problems.length} problem(s), the affected sources retry on the next run:\n${problems.join('\n')}`);
	process.exitCode = 1;
}
