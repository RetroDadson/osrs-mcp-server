# OSRS MCP Server

Website: [osrsmcp.retrodadson.com](https://osrsmcp.retrodadson.com)

Source for plugin: [github.com/RetroDadson/osrs-mcp-tracker-plugin](https://github.com/RetroDadson/osrs-mcp-tracker-plugin)

This repo is the backend and account/token-management website for the plugin above. It stores OSRS player data reported by the plugin and exposes it through an [MCP](https://modelcontextprotocol.io/) server, so an AI assistant (e.g. Claude) can query it directly. It works for solo accounts and groups alike, and for every OSRS account type (regular, Ironman, Hardcore Ironman, Ultimate Ironman, Group Ironman).

Originally forked from [group-ironmen](https://github.com/christoabrown/group-ironmen) — thanks to the original author for the excellent groundwork this project builds on.

Currently tracks:

* Inventory, equipment, bank, rune pouch, seed vault, and shared bank
* Skill XP
* World position
* HP, prayer, energy, and world, as well as showing inactivity
* Quest state — completed, finished, in progress
* Achievement Diaries
* Collection Log

More data categories (Slayer tasks, kill counts, clue scrolls, deaths, farming patches) and the MCP server itself are on the way.

# Self-hosting

It is possible to self-host the frontend and backend rather than use [osrsmcp.retrodadson.com](https://osrsmcp.retrodadson.com).

In the plugin settings, put the URL that you are hosting the server on. Leaving it blank will default to the public server above.

## With Docker

Prerequisites

* Docker
* docker-compose

### With docker-compose

Copy the `docker-compose.yml`, `.env.example`, and `schema.sql` (exists in `server/src/sql`) files onto your server.

Copy the contents of `.env.example` into a new file named `.env` in the same directory and fill it with your secrets.

The `.env` file explains what should go into each secret.

The `docker-compose.yml` has a line that takes the path to the `schema.sql`. Make sure to update this to the relative or absolute path of the file on your server.

`docker-compose.yml` builds the frontend and backend images locally from source (`./site` and `./server`) rather than pulling published images, since none are published for this fork yet. After you have set up the `.env` file and `schema.sql` path, you can run `docker-compose up -d --build` and this will build and start both the frontend and backend. The backend should be available on port 5000 and the frontend on port 4000, although these can be changed in the docker-compose file.

### Without docker-compose (untested)

If you are not using docker-compose, you will have to set up the Postgres database and pass secrets in using Docker environment variables. See below in the [Without Docker](#without-docker) section for how to set up the database.

Build and run the frontend image yourself (`docker build -t osrs-mcp-frontend ./site`), then run it:

```sh
docker run -d -e HOST_URL= osrs-mcp-frontend
```

Same thing for the backend (`docker build -t osrs-mcp-backend ./server`):

```sh
docker run -d -e PG_USER= -e PG_PASSWORD= -e PG_HOST= -e PG_PORT= -e PG_DB= -e BACKEND_SECRET= osrs-mcp-backend
```

Check `.env.example` for an explanation on what the value of each environment variable should be.

Once it's running, the backend should be available on port 8080 and the frontend on port 4000.

## Without Docker

To be filled...
