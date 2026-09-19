# Cayley

A cinematic 3D studio for Rubik’s-cube graph theory — the cube is a graph.

Each node is a cube state. Each edge is a face turn. The gold path is a route home: a geodesic on the Cayley graph of the cube group.

Inspired by [The Math Flow’s graph-theory solve](https://x.com/TheMathFlow/status/2101154346583154801).

## What it does

- **Live WebGL constellation** — dozens of physical 3×3 cubes floating in a void, each a reachable state
- **Gold geodesic** — the scramble/solve path drawn as a glowing tube through the graph
- **Orbit** — slow cinematic camera; drag to look, scroll to zoom
- **New path** — another random walk and its reverse-solve

The 3×3 cube group has 43,252,003,274,489,856,000 reachable states. God’s number is 20. This stage shows a local chart of that graph, not the whole thing.

## Stack

TanStack Start, React, Three.js, Tailwind. No accounts. Graph search runs in the browser.

## Run

```bash
npm install
npm run dev
```
