import { defineTool } from "@barry-rocks/sdk-bags";
import { z } from "zod";
import { runClickHouseCtl, clickHouseCtlAvailability } from "./exec.js";

// ── Status ──────────────────────────────────────────────────────────────────

export const clickhousectlStatus = defineTool({
  namespace: "clickhousectl",
  access: "read",
  name: "clickhousectl_status",
  description:
    "Check whether clickhousectl is installed, its version, and cloud auth status.",
  schema: {},
  handler: async () => {
    const availability = await clickHouseCtlAvailability();
    if (!availability.reachable) {
      // `installed: false` for a binary that is present just sends people to
      // reinstall it. Report the two facts separately, and say what to do
      // about the case reinstalling would not fix.
      return {
        installed: availability.installed,
        reachable: false,
        ...(availability.path ? { path: availability.path } : {}),
        detail: availability.detail,
        ...(availability.installed
          ? { fix: "Re-run `bash scripts/launchd/setup` so the MCP server's PATH includes it." }
          : { installCommand: "curl https://clickhouse.com/cli | sh" }),
      };
    }

    const version = await runClickHouseCtl(["--version"]).catch(() => "unknown");

    let cloudAuth = "unknown";
    try {
      const authOutput = await runClickHouseCtl(["cloud", "auth", "status"]);
      cloudAuth = authOutput.includes('"Active"') ? "authenticated" : "not authenticated";
    } catch {
      cloudAuth = "not authenticated";
    }

    return { installed: true, version, cloudAuth };
  },
});

// ── Local Server Management ─────────────────────────────────────────────────

export const clickhousectlLocalServerList = defineTool({
  namespace: "clickhousectl",
  access: "read",
  name: "clickhousectl_local_server_list",
  description:
    "List all local ClickHouse server instances (running and stopped) with their ports and status.",
  schema: {},
  handler: async () => {
    const output = await runClickHouseCtl(["local", "server", "list"]);
    return { output };
  },
});

export const clickhousectlLocalServerStart = defineTool({
  namespace: "clickhousectl",
  access: "write",
  name: "clickhousectl_local_server_start",
  description:
    "Start a local ClickHouse server instance. Auto-detects an available port. Optionally specify a name and ClickHouse version.",
  schema: {
    name: z.string().optional().describe("Server instance name (default: auto-generated)"),
    version: z.string().optional().describe("ClickHouse version to use (e.g. 'latest', 'stable', 'lts', or specific version)"),
  },
  handler: async ({ name, version }) => {
    const args = ["local", "server", "start"];
    if (name) args.push("--name", name);
    if (version) args.push("--version", version);
    const output = await runClickHouseCtl(args, { timeoutMs: 60_000 });
    return { output };
  },
});

export const clickhousectlLocalServerStop = defineTool({
  namespace: "clickhousectl",
  access: "write",
  name: "clickhousectl_local_server_stop",
  description: "Stop a running local ClickHouse server instance by name.",
  schema: {
    name: z.string().describe("Server instance name to stop"),
  },
  handler: async ({ name }) => {
    const output = await runClickHouseCtl(["local", "server", "stop", name]);
    return { output };
  },
});

// ── Cloud Service Management ────────────────────────────────────────────────

export const clickhousectlCloudServiceList = defineTool({
  namespace: "clickhousectl",
  access: "read",
  name: "clickhousectl_cloud_service_list",
  description:
    "List all ClickHouse Cloud services in your organization with their status, region, and tier.",
  schema: {},
  handler: async () => {
    const output = await runClickHouseCtl(["cloud", "service", "list"]);
    return { output };
  },
});

export const clickhousectlCloudServiceGet = defineTool({
  namespace: "clickhousectl",
  access: "read",
  name: "clickhousectl_cloud_service_get",
  description:
    "Get detailed information about a specific ClickHouse Cloud service by ID or name.",
  schema: {
    service: z.string().describe("Service ID or name"),
  },
  handler: async ({ service }) => {
    const output = await runClickHouseCtl(["cloud", "service", "get", service]);
    return { output };
  },
});

export const clickhousectlCloudOrgUsage = defineTool({
  namespace: "clickhousectl",
  access: "read",
  name: "clickhousectl_cloud_org_usage",
  description:
    "View resource usage metrics for your ClickHouse Cloud organization.",
  schema: {},
  handler: async () => {
    const output = await runClickHouseCtl(["cloud", "org", "usage"]);
    return { output };
  },
});
