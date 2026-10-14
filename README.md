# ClickHouse (Barry bag)

ClickHouse query execution, schema inspection, and infrastructure management.

## Tools

- `clickhousectl_status` — Check whether clickhousectl is installed, its version, and cloud auth status
- `clickhousectl_local_server_list` — List all local ClickHouse server instances with their ports and status
- `clickhousectl_local_server_start` — Start a local ClickHouse server instance
- `clickhousectl_local_server_stop` — Stop a running local ClickHouse server instance by name
- `clickhousectl_cloud_service_list` — List all ClickHouse Cloud services in your organization
- `clickhousectl_cloud_service_get` — Get details about a specific ClickHouse Cloud service
- `clickhousectl_cloud_org_usage` — View resource usage metrics for your ClickHouse Cloud organization

## Bundled upstream skills

Skills and their references ship directly in `skills/`, with licenses preserved. No sibling clones or absolute symlinks are required. `./setup.sh --status` verifies the local payload. `skills/upstream.json` records upstream repositories and pinned revisions. To update, deliberately change a revision there, run `./setup.sh --update`, review the resulting diff, and validate the bag. The updater replaces the listed skill directories; keep local customizations outside those directories.
