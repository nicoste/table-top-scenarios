# Table Top Scenarios

A table tool for a group sitting in one room, on two screens: a **GM console**
for the game master, and a **table display** that everyone at the table looks
at. It holds what is hard to keep in your head — a 3D world and its encounter
maps, line of sight and cover, travel time, what the party has discovered — and
leaves to the people at the table everything they enjoy deciding themselves:
dice, damage, initiative, rules.

One computer runs the host; both screens are browser pages that connect to it.
Nothing leaves your network, and there are no accounts.

## Running it

You need [Node.js](https://nodejs.org) 26. The version is pinned in `.nvmrc`.

```bash
npm install
npm run start
```

`npm run start` builds both screens, starts the host, and prints where they are:

- GM console: http://localhost:8080/gm/
- Table display: http://localhost:8080/table/

To show the table display on another computer on the same network, open the
**LAN** address the host prints there. The GM console shows the same address,
ready to copy.

Two settings, both optional:

| Variable | Default | What it sets |
|---|---|---|
| `PORT` | `8080` | the port the host listens on |
| `TT_DATA` | `data/` | where campaigns and saves are kept |

## Where your world is kept

In `data/`, as plain JSON, and **tracked in git on purpose**: hours of built
world are worth more than a quiet diff (D-134). Commit it like code. The host
also copies it into `data/backups/` every time it starts (D-320); those copies
stay out of git.

## Working on it

```bash
npm run verify   # typecheck, dependency rules, lint, tests
npm run build    # both screens
```

The same two run on GitHub for every push and pull request
([`checks.yml`](.github/workflows/checks.yml)).

The docs, in reading order:

1. [GLOSSARY](docs/GLOSSARY.md): every term, defined once.
2. [PLAYBOOK](docs/PLAYBOOK.md): how a change is made, and how you know it is done.
3. [ARCHITECTURE](docs/ARCHITECTURE.md): the rules, numbered `R-n`. Where the
   code and this disagree, the code is the bug.
4. [DECISIONS](docs/DECISIONS.md): every choice, numbered `D-n`, with its reasons.
5. [MEASUREMENTS](docs/MEASUREMENTS.md): what things cost, measured.

## Layout

```
apps/
  host/          the Node process: sockets, the session, serving the screens
  gm/            the GM console
  table/         the table display
packages/
  geometry/      pure spatial math: sight lines through a grid of cubes
  domain/        the nouns and their rules: campaign, world, places, maps, tokens
  protocol/      the wire contract: intents, views, schemas
  sim/           applies every change, and decides what each screen may see
  persistence/   campaign and save files: reading, writing, migrating
  render/        three.js: the world and maps drawn
  client-core/   what both screens share: the connection, the stage
  ui/            panels, lists, sliders: no game words at all
```

Each package's `README.md` says what it owns and what it must never know.
