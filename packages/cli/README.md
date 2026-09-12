# @dotpm/cli

The `dotpm` command reads and edits the projects and tasks of a vault open in Obsidian with the [dotpm](https://github.com/dotpm/obsidian-pm) plugin, through the plugin's local API. Turn the API on in Obsidian under Settings > Local API, then:

```sh
npx @dotpm/cli projects
```

Run it inside the vault folder and it finds the server on its own. It prints tables in a terminal and JSON in a pipe, and `dotpm mcp` serves the plugin's MCP tools over stdio for clients that cannot use HTTP.

The commands, fields and exit codes are documented in [docs/cli.md](https://github.com/dotpm/obsidian-pm/blob/main/docs/cli.md).
