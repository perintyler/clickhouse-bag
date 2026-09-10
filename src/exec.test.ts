/**
 * Tests for how a failed clickhousectl lookup is explained.
 *
 * The bug these pin: every failure said "clickhousectl is not installed.
 * Install it: curl ... | sh". Under the MCP server's launchd agent the binary
 * WAS installed — in ~/.local/bin, which that agent's PATH does not list — so
 * the advice was to reinstall something already on disk, and the real cause
 * (an unreachable PATH) went unmentioned.
 *
 * `sh` prints "command not found" for both an absent binary and an unreachable
 * one, so the distinction cannot come from the message; it has to come from
 * probing the filesystem. That is what these tests hold in place.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runClickHouseCtl, clickHouseCtlAvailability } from "./exec.js";

let root: string;
let installDir: string;
const originalPath = process.env.PATH;
const originalHome = process.env.HOME;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ch-exec-"));
  // A HOME whose .local/bin holds a fake clickhousectl, so the "installed
  // elsewhere" probe has something real to find.
  installDir = join(root, "home", ".local", "bin");
  mkdirSync(installDir, { recursive: true });
});

afterEach(() => {
  process.env.PATH = originalPath;
  process.env.HOME = originalHome;
  rmSync(root, { recursive: true, force: true });
});

function installFake(): string {
  const p = join(installDir, "clickhousectl");
  writeFileSync(p, "#!/bin/sh\necho fake\n");
  chmodSync(p, 0o755);
  return p;
}

async function failureMessage(): Promise<string> {
  try {
    await runClickHouseCtl(["--version"], { timeoutMs: 5_000 });
    throw new Error("expected the call to fail");
  } catch (e) {
    return (e as Error).message;
  }
}

describe("an unreachable clickhousectl", () => {
  it("is not reported as uninstalled, and names where it actually is", async () => {
    const installed = installFake();
    process.env.HOME = join(root, "home");
    // /bin and /usr/bin so the shell still runs; neither holds clickhousectl.
    process.env.PATH = "/bin:/usr/bin";

    const msg = await failureMessage();

    // The original defect, stated as an assertion.
    expect(msg).not.toMatch(/is not installed/);
    expect(msg).not.toMatch(/curl https:\/\/clickhouse\.com\/cli/);

    expect(msg).toContain(installed);
    expect(msg).toContain("not on this process's PATH");
    // The PATH is the evidence for the claim, so it has to be in the message.
    expect(msg).toContain("/bin:/usr/bin");
  });

  it("points at the launchd regeneration step, not a reinstall", async () => {
    installFake();
    process.env.HOME = join(root, "home");
    process.env.PATH = "/bin:/usr/bin";

    expect(await failureMessage()).toContain("scripts/launchd/setup");
  });
});

describe("a genuinely absent clickhousectl", () => {
  it("says so, and only then suggests installing it", async () => {
    // Nothing installed anywhere the probe looks.
    process.env.HOME = join(root, "empty-home");
    process.env.PATH = "/bin:/usr/bin";

    const msg = await failureMessage();

    expect(msg).toContain("was not found");
    expect(msg).toContain("curl https://clickhouse.com/cli | sh");
    // Must not claim an install location it did not find.
    expect(msg).not.toMatch(/is installed at/);
  });

  it("lists the directories it searched, so the claim is checkable", async () => {
    process.env.HOME = join(root, "empty-home");
    process.env.PATH = "/bin:/usr/bin";

    const msg = await failureMessage();

    expect(msg).toContain("/opt/homebrew/bin");
    expect(msg).toContain(join(root, "empty-home", ".local/bin"));
  });
});

describe("clickHouseCtlAvailability", () => {
  it("reports an unreachable binary as installed, so callers do not say otherwise", async () => {
    // What clickhousectl_status got wrong: it collapsed every failure into
    // `installed: false`, which for a binary sitting in ~/.local/bin is
    // simply untrue and points at the wrong remedy.
    const installed = installFake();
    process.env.HOME = join(root, "home");
    process.env.PATH = "/bin:/usr/bin";

    const a = await clickHouseCtlAvailability();

    expect(a.installed).toBe(true);
    expect(a.reachable).toBe(false);
    expect(a.path).toBe(installed);
    expect(a.detail).toContain("not on this process's PATH");
  });

  it("reports a genuinely absent binary as neither installed nor reachable", async () => {
    process.env.HOME = join(root, "empty-home");
    process.env.PATH = "/bin:/usr/bin";

    const a = await clickHouseCtlAvailability();

    expect(a.installed).toBe(false);
    expect(a.reachable).toBe(false);
    expect(a.detail).toContain("curl https://clickhouse.com/cli | sh");
  });
});

describe("a real clickhousectl failure", () => {
  it("surfaces the underlying error instead of blaming the install", async () => {
    // A stub that exits non-zero with a message containing "not found" —
    // the substring the old code keyed on. A missing cloud service must not
    // be reported as a missing binary.
    const dir = join(root, "bin");
    mkdirSync(dir, { recursive: true });
    const stub = join(dir, "clickhousectl");
    writeFileSync(stub, '#!/bin/sh\necho "service xyz not found" >&2\nexit 1\n');
    chmodSync(stub, 0o755);

    process.env.HOME = join(root, "home");
    process.env.PATH = `${dir}:/bin:/usr/bin`;

    const msg = await failureMessage();

    expect(msg).toContain("service xyz not found");
    expect(msg).not.toMatch(/curl https:\/\/clickhouse\.com\/cli/);
  });
});
