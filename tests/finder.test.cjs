const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const fsfind = require("../dist/cjs/index.js");
const { find, findAll, findSync, createFinder, clearCache, FsFinder, SearchTimeoutError } = fsfind;

let root;
let external;
let cacheDir;

function writeFile(relativePath, contents) {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, contents ?? "");
    return fullPath;
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "fsfind-"));
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsfind-cache-"));
    external = undefined;

    writeFile("alpha/target.txt", "alpha");
    writeFile("alpha/beta/deep-target.txt", "deep");
    writeFile("alpha/beta/nested/too-deep.txt", "nested");
    writeFile("other/target.txt", "other");
    writeFile("node_modules/target.txt", "ignored");
    writeFile("README.md", "readme");
    fs.mkdirSync(path.join(root, "target-dir"), { recursive: true });
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cacheDir, { recursive: true, force: true });

    if (external !== undefined) {
        fs.rmSync(external, { recursive: true, force: true });
    }
});

test("find returns an absolute path for an exact name", async () => {
    const result = await find("deep-target.txt", { roots: [root] });

    assert.ok(result);
    assert.ok(path.isAbsolute(result));
    assert.ok(result.endsWith(path.join("alpha", "beta", "deep-target.txt")));
});

test("findAll returns every match outside ignored directories", async () => {
    const results = await findAll("target.txt", { roots: [root], caseSensitive: true });

    assert.equal(results.length, 2);
    assert.ok(results.every((item) => path.basename(item) === "target.txt"));
    assert.ok(results.every((item) => !item.includes("node_modules")));
});

test("node_modules is ignored by default and can be enabled", async () => {
    const ignored = await findAll("target.txt", { roots: [root], caseSensitive: true });
    assert.equal(ignored.length, 2);

    const all = await findAll("target.txt", {
        roots: [root],
        caseSensitive: true,
        useDefaultIgnores: false,
    });

    assert.equal(all.length, 3);
    assert.ok(all.some((item) => item.includes("node_modules")));
});

test("ignore patterns support negation with last match wins", async () => {
    const results = await findAll("target.txt", {
        roots: [root],
        caseSensitive: true,
        useDefaultIgnores: false,
        ignore: ["target.txt", "!**/alpha/target.txt"],
    });

    assert.equal(results.length, 1);
    assert.ok(results[0].endsWith(path.join("alpha", "target.txt")));
});

test("trailing slash restricts ignore patterns to directories", async () => {
    writeFile("logs/keep.txt", "keep");
    writeFile("sub/logs", "file named logs");

    const found = await findAll("logs", {
        roots: [root],
        caseSensitive: true,
        useDefaultIgnores: false,
        ignore: ["logs/"],
    });

    assert.equal(found.length, 1);
    assert.ok(found[0].endsWith(path.join("sub", "logs")));

    const keep = await find("keep.txt", {
        roots: [root],
        caseSensitive: true,
        useDefaultIgnores: false,
        ignore: ["logs/"],
    });

    assert.equal(keep, undefined);
});

test("path ignore patterns match absolute prefixes", async () => {
    const results = await findAll("target.txt", {
        roots: [root],
        caseSensitive: true,
        useDefaultIgnores: false,
        ignore: [path.join(root, "other")],
    });

    assert.equal(results.length, 2);
    assert.ok(results.every((item) => !item.includes(`${path.sep}other${path.sep}`)));
});

test("case sensitivity follows the option", async () => {
    const insensitive = await find("readme.md", { roots: [root], caseSensitive: false });
    assert.ok(insensitive);
    assert.ok(insensitive.endsWith("README.md"));

    const sensitive = await find("readme.md", { roots: [root], caseSensitive: true });
    assert.equal(sensitive, undefined);
});

test("directories can be matched and filtered", async () => {
    const found = await find("target-dir", { roots: [root], caseSensitive: true });
    assert.ok(found);
    assert.ok(fs.statSync(found).isDirectory());

    const filesOnly = await find("target-dir", {
        roots: [root],
        caseSensitive: true,
        include: { dirs: false },
    });
    assert.equal(filesOnly, undefined);

    const dirsOnly = await find("target.txt", {
        roots: [root],
        caseSensitive: true,
        include: { files: false },
    });
    assert.equal(dirsOnly, undefined);
});

test("maxDepth limits traversal", async () => {
    const shallow = await find("too-deep.txt", {
        roots: [root],
        caseSensitive: true,
        maxDepth: 2,
    });
    assert.equal(shallow, undefined);

    const deep = await find("too-deep.txt", {
        roots: [root],
        caseSensitive: true,
        maxDepth: 3,
    });
    assert.ok(deep);
    assert.ok(deep.endsWith("too-deep.txt"));
});

test("glob and regex matching", async () => {
    const glob = await find("*.md", { roots: [root], match: "glob", caseSensitive: false });
    assert.ok(glob);
    assert.ok(glob.endsWith("README.md"));

    const regex = await find("^readme\\.md$", {
        roots: [root],
        match: "regex",
        caseSensitive: false,
    });
    assert.ok(regex);
    assert.ok(regex.endsWith("README.md"));
});

test("limit caps the number of results", async () => {
    const results = await findAll("target.txt", {
        roots: [root],
        caseSensitive: true,
        limit: 1,
    });

    assert.equal(results.length, 1);
});

test("findSync finds a unique name", () => {
    const result = findSync("deep-target.txt", { roots: [root], caseSensitive: true });

    assert.ok(result);
    assert.ok(result.endsWith("deep-target.txt"));
});

test("createFinder reuses constructor defaults", async () => {
    const finder = createFinder({ roots: [root], caseSensitive: true });

    assert.ok(finder instanceof FsFinder);

    const result = await finder.find("deep-target.txt");
    assert.ok(result);
    assert.ok(result.endsWith("deep-target.txt"));
});

test("aborting rejects the search", async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
        find("target.txt", { roots: [root], signal: controller.signal }),
        (error) => error.name === "AbortError",
    );
});

test("invalid options are rejected", async () => {
    await assert.rejects(find("target.txt", { roots: [root], timeoutMs: 0 }), RangeError);
    await assert.rejects(find("target.txt", { roots: [root], maxDepth: -1 }), RangeError);
    await assert.rejects(find("target.txt", { roots: [root], concurrency: 0 }), RangeError);

    assert.throws(() => findSync("target.txt", { roots: [root], timeoutMs: 0 }), RangeError);
    assert.equal(typeof SearchTimeoutError, "function");
});

test("invalid target and roots are rejected", async () => {
    await assert.rejects(find("alpha/target.txt", { roots: [root] }), TypeError);
    await assert.rejects(find("", { roots: [root] }), TypeError);
    await assert.rejects(
        find("target.txt", { roots: [path.join(root, "missing")] }),
        /root does not exist/,
    );

    assert.throws(() => findSync("a/b", { roots: [root] }), TypeError);
});

test("progress callback is invoked", async () => {
    const events = [];

    await findAll("target.txt", {
        roots: [root],
        caseSensitive: true,
        onProgress: (progress) => events.push(progress),
    });

    assert.ok(events.length > 0);
    assert.equal(typeof events[0].visitedDirs, "number");
    assert.ok(events.some((event) => event.matches > 0));
});

test("symbolic links are not followed by default", async (t) => {
    external = fs.mkdtempSync(path.join(os.tmpdir(), "fsfind-external-"));
    fs.writeFileSync(path.join(external, "linked.txt"), "linked");

    try {
        fs.symlinkSync(external, path.join(root, "link-dir"), "junction");
    } catch (error) {
        t.skip(`cannot create a symbolic link: ${error.message}`);
        return;
    }

    const withoutLinks = await find("linked.txt", { roots: [root], caseSensitive: true });
    assert.equal(withoutLinks, undefined);

    const withLinks = await find("linked.txt", {
        roots: [root],
        caseSensitive: true,
        followSymlinks: true,
    });

    assert.ok(withLinks);
    assert.ok(withLinks.endsWith("linked.txt"));
});

test("parallel scanning returns the same matches", async () => {
    const serial = await findAll("target.txt", {
        roots: [root],
        caseSensitive: true,
        useDefaultIgnores: false,
    });

    const parallel = await findAll("target.txt", {
        roots: [root],
        caseSensitive: true,
        useDefaultIgnores: false,
        workers: 2,
    });

    assert.deepEqual([...parallel].sort(), [...serial].sort());
});

test("parallel find respects the result limit", async () => {
    const results = await findAll("target.txt", {
        roots: [root],
        caseSensitive: true,
        useDefaultIgnores: false,
        workers: 4,
        limit: 1,
    });

    assert.equal(results.length, 1);
});

test("parallel scanning honours maxDepth", async () => {
    const shallow = await find("too-deep.txt", {
        roots: [root],
        caseSensitive: true,
        workers: 2,
        maxDepth: 2,
    });
    assert.equal(shallow, undefined);

    const deep = await find("too-deep.txt", {
        roots: [root],
        caseSensitive: true,
        workers: 2,
        maxDepth: 3,
    });

    assert.ok(deep);
    assert.ok(deep.endsWith("too-deep.txt"));
});

test("parallel scanning reports progress and rejects on abort", async () => {
    const events = [];

    await findAll("deep-target.txt", {
        roots: [root],
        workers: 2,
        onProgress: (progress) => events.push(progress),
    });

    assert.ok(events.length > 0);

    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
        find("target.txt", { roots: [root], workers: 2, signal: controller.signal }),
        (error) => error.name === "AbortError",
    );
});

test("invalid workers option is rejected", async () => {
    await assert.rejects(find("target.txt", { roots: [root], workers: -1 }), RangeError);
    await assert.rejects(find("target.txt", { roots: [root], workers: 1.5 }), RangeError);
    await assert.rejects(find("target.txt", { roots: [root], workers: "many" }), RangeError);
    await assert.rejects(find("target.txt", { roots: [root], cache: { ttlMs: 0 } }), RangeError);
    await assert.rejects(
        find("target.txt", { roots: [root], cache: { maxEntries: 0 } }),
        RangeError,
    );
});

test("workers auto selects a pool", async () => {
    const results = await findAll("target.txt", {
        roots: [root],
        caseSensitive: true,
        useDefaultIgnores: false,
        workers: "auto",
    });

    assert.equal(results.length, 3);
});

test("result cache serves repeated searches", async () => {
    const options = {
        roots: [root],
        caseSensitive: true,
        cache: { dir: cacheDir },
    };

    const first = await find("deep-target.txt", options);
    assert.ok(first);

    fs.rmSync(path.join(root, "alpha", "beta", "deep-target.txt"));

    const second = await find("deep-target.txt", options);
    assert.equal(second, first);

    await clearCache({ dir: cacheDir });

    const third = await find("deep-target.txt", options);
    assert.equal(third, undefined);
});

test("result cache expires after the TTL", async () => {
    const options = {
        roots: [root],
        caseSensitive: true,
        cache: { dir: cacheDir, ttlMs: 10 },
    };

    assert.ok(await find("deep-target.txt", options));
    fs.rmSync(path.join(root, "alpha", "beta", "deep-target.txt"));

    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(await find("deep-target.txt", options), undefined);
});

test("cache keys separate find and findAll", async () => {
    const options = {
        roots: [root],
        caseSensitive: true,
        useDefaultIgnores: false,
        cache: { dir: cacheDir },
    };

    assert.ok(await find("target.txt", options));

    const results = await findAll("target.txt", options);
    assert.equal(results.length, 3);
});

test("result cache is disabled by default", async () => {
    const options = { roots: [root], caseSensitive: true };

    assert.ok(await find("deep-target.txt", options));
    fs.rmSync(path.join(root, "alpha", "beta", "deep-target.txt"));

    assert.equal(await find("deep-target.txt", options), undefined);
});

test("cache failures do not break the search", async () => {
    const cachePath = path.join(root, "cache-file");
    fs.writeFileSync(cachePath, "not a directory");

    const result = await find("deep-target.txt", {
        roots: [root],
        caseSensitive: true,
        cache: { dir: cachePath },
    });

    assert.ok(result);
});

test("CommonJS default export is callable", async () => {
    assert.equal(typeof fsfind.default, "function");

    const result = await fsfind.default("deep-target.txt", {
        roots: [root],
        caseSensitive: true,
    });

    assert.ok(result);
    assert.ok(result.endsWith("deep-target.txt"));
});

test("ESM bundle exposes named and default exports", async () => {
    const esm = await import("../dist/es/index.mjs");

    assert.equal(typeof esm.default, "function");
    assert.equal(typeof esm.find, "function");
    assert.equal(typeof esm.FsFinder, "function");

    const result = await esm.default("deep-target.txt", {
        roots: [root],
        caseSensitive: true,
    });

    assert.ok(result);
    assert.ok(result.endsWith("deep-target.txt"));
});

test("ESM bundle supports parallel scanning", async () => {
    const esm = await import("../dist/es/index.mjs");

    const results = await esm.findAll("target.txt", {
        roots: [root],
        caseSensitive: true,
        useDefaultIgnores: false,
        workers: 2,
    });

    assert.equal(results.length, 3);
});
