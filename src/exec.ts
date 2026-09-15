import { exec } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { join, dirname, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

// No TS parameter properties here — the MCP server imports bag tools under
// Node's strip-only type stripping, which can't transform that syntax.
export class ClickHouseCtlError extends Error {
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(message: string, exitCode: number | null, stderr: string) {
    super(message);
    this.name = "ClickHouseCtlError";
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

function shellEscape(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Find a directory containing .clickhouse/tokens.json by walking up from a
 * starting path. clickhousectl stores OAuth tokens in .clickhouse/tokens.json
 * relative to the CWD where `auth login` was run, so we need to find that
 * directory to pass as cwd when spawning the process.
 */
function findTokenDir(startDir: string): string | undefined {
  let dir = startDir;
  // Walk up at most 10 levels to avoid infinite loops on weird filesystems
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, ".clickhouse", "tokens.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const home = process.env.HOME;
  if (home && existsSync(join(home, ".clickhouse", "tokens.json"))) {
    return home;
  }
  return undefined;
}

/**
 * Run a clickhousectl command and return parsed output.
 *
 * Uses exec (shell) so the command resolves the same way a user's would.
 * Note the shell inherits THIS process's environment, which under the MCP
 * server's launchd agent is a minimal one — not your login shell.
 * Sets cwd to a directory containing .clickhouse/tokens.json so clickhousectl
 * can find its stored OAuth token.
 *
 * Throws ClickHouseCtlError if the binary isn't reachable or the command
 * fails.
 */
export function runClickHouseCtl(
  args: string[],
  options?: { timeoutMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const cmd = ["clickhousectl", ...args.map(shellEscape)].join(" ");

  // Find a CWD where clickhousectl can access its OAuth token
  const packDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const cwd = findTokenDir(packDir) ?? process.env.HOME ?? undefined;

  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs, cwd }, (error, stdout, stderr) => {
      if (error) {
        const msg = stderr.trim() || error.message;
        // `sh` reports an unreachable command and an uninstalled one with the
        // same "command not found", so the message alone cannot tell them
        // apart — only probing the filesystem can. And the message is not even
        // reliable evidence that the lookup was what failed: clickhousectl's
        // own errors say "not found" too (a missing cloud service, say). So
        // the resolvable check comes FIRST, and a binary we can actually see
        // is never blamed on the install.
        const resolvable = findClickHouseCtl((process.env.PATH ?? "").split(delimiter)) !== null;
        const lookupFailed =
          !resolvable &&
          ((error as NodeJS.ErrnoException).code === "ENOENT" ||
            msg.includes("not found") ||
            msg.includes("No such file"));

        if (lookupFailed) {
          reject(new ClickHouseCtlError(describeUnreachable(), null, stderr));
          return;
        }
        reject(
          new ClickHouseCtlError(
            `clickhousectl ${args.join(" ")} failed: ${msg}`,
            error.code ?? null,
            stderr,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Directories worth checking for an install this process's PATH cannot see.
 *
 * Computed per call rather than at module load: HOME is read from the
 * environment, and a module-level constant would freeze whatever it happened
 * to be when the tools were first imported.
 */
function commonInstallDirs(): string[] {
  const home = process.env.HOME;
  return [
    ...(home ? [join(home, ".local/bin")] : []),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ];
}

/** First directory on `paths` holding an executable `clickhousectl`. */
function findClickHouseCtl(paths: string[]): string | null {
  for (const dir of paths) {
    if (!dir) continue;
    const candidate = join(dir, "clickhousectl");
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not here; keep looking.
    }
  }
  return null;
}

/**
 * Explain a failed lookup without asserting an install state we did not check.
 *
 * "Not installed" is only one of the two reasons the shell could not run it,
 * and the other — installed somewhere this process's PATH does not list — is
 * the one that reinstalling will not fix.
 */
function describeUnreachable(): string {
  // Only called once the binary is known NOT to resolve on PATH, so the
  // question left is whether it exists at all.
  const currentPath = process.env.PATH ?? "";
  const searched = commonInstallDirs();
  const elsewhere = findClickHouseCtl(searched);
  if (elsewhere) {
    return (
      `clickhousectl is installed at ${elsewhere} but is not on this process's PATH, ` +
      `so it cannot be run from here. PATH: ${currentPath}. ` +
      `If this is the Barry MCP server, re-run \`bash scripts/launchd/setup\` to regenerate its launchd PATH.`
    );
  }

  return (
    `clickhousectl was not found on this process's PATH (${currentPath}) ` +
    `nor in ${searched.join(", ")}. ` +
    `Install it: curl https://clickhouse.com/cli | sh`
  );
}

/**
 * Check whether clickhousectl is installed and reachable on PATH.
 *
 * Prefer `clickHouseCtlAvailability()` when the answer is shown to someone: a
 * bare false cannot say whether the binary is absent or merely unreachable,
 * and those need opposite remedies.
 */
export async function isClickHouseCtlInstalled(): Promise<boolean> {
  return (await clickHouseCtlAvailability()).reachable;
}

export interface ClickHouseCtlAvailability {
  /** Can this process actually run it? */
  reachable: boolean;
  /** Present on disk, even if this process's PATH cannot see it. */
  installed: boolean;
  /** Where it was found, when it was found. */
  path?: string;
  /** Why it is unavailable — omitted when reachable. */
  detail?: string;
}

/**
 * Report whether clickhousectl can be run, and if not, why.
 *
 * Splitting `installed` from `reachable` is the point: reporting
 * `installed: false` for a binary sitting in ~/.local/bin sent someone to
 * reinstall a tool they already had, while the actual cause — a launchd PATH
 * that omits that directory — went unmentioned.
 */
export async function clickHouseCtlAvailability(): Promise<ClickHouseCtlAvailability> {
  const onPath = findClickHouseCtl((process.env.PATH ?? "").split(delimiter));
  if (onPath) {
    try {
      await runClickHouseCtl(["--version"], { timeoutMs: 5_000 });
      return { reachable: true, installed: true, path: onPath };
    } catch (e) {
      // On PATH but not runnable (bad permissions, wrong architecture...).
      return {
        reachable: false,
        installed: true,
        path: onPath,
        detail: (e as Error).message,
      };
    }
  }

  const elsewhere = findClickHouseCtl(commonInstallDirs());
  return {
    reachable: false,
    installed: elsewhere !== null,
    ...(elsewhere ? { path: elsewhere } : {}),
    detail: describeUnreachable(),
  };
}
