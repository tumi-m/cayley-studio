# Cayley

A cinematic 3D studio for Rubik’s-cube graph theory.

Each node is a cube state. Each edge is a face turn. The gold path is a route home — a geodesic on the Cayley graph of the cube group.

Inspired by [The Math Flow’s graph-theory solve](https://x.com/TheMathFlow/status/2101154346583154801).

## What it does

- **Live WebGL stage** — a physical 3×3 cube plus a constellation of mini-cubes (the move graph)
- **Shortest path** — breadth-first search on a short scramble, then playback of the optimal route
- **Cayley cloud** — a longer walk through the state graph with a reverse-solve geodesic
- **Search wave** — BFS shells lighting up by depth
- **Record** — capture the stage to a WebM
- **Films** — pre-rendered cinematic clips of the same idea

The 3×3 cube group has 43,252,003,274,489,856,000 reachable states. God’s number is 20. The stage shows a local chart of that graph, not the whole thing.

## Stack

TanStack Start, React, Three.js, Tailwind. No accounts. Graph search runs in the browser.

## Run

```bash
npm install
npm run dev
```

## Higgsfield

Higgsfield MCP is not available in this environment (it is not a connected Grok connector). Cinematic films were generated with xAI video models; the interactive engine is real-time WebGL so you can scramble, solve, and orbit without an API key.
