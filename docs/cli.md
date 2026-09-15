# Command line

The `dotpm` command lives in its own repository, [dotpm/cli](https://github.com/dotpm/cli), and installs from npm:

```sh
npm install -g @dotpm/cli
```

It talks to the plugin through the [local API](api.md), so that has to be on: Settings > Local API in Obsidian. The commands, connection options, exit codes, the MCP bridge over stdio and the agent skill are documented in that repository's README.
