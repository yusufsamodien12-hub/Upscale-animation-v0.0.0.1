# Upscale Animation

A small web app to extract frames from videos, apply an offline (non‑AI) enhancement pipeline with theme presets, and download results. Built with React + TypeScript + Vite.

## Features
- Two‑phase processing: extract frames, then enhance them.
- Local (non‑AI) enhancer: 2x upscale, unsharp mask, and CSS‑filter theme presets.
- Download enhanced frames as a ZIP.
- Progress UI and robust error handling.
- Ready for GitHub Pages deployment (`gh-pages` branch or `main/docs`).

## Quickstart (development)
1. Install dependencies:

   npm install

2. Start dev server:

   npm run dev

3. Open http://localhost:5173

## Build (production)

   npm run build

The build output is placed in `dist/`.

## Deploy to GitHub Pages
Two common options:

- Use the `gh-pages` branch (recommended for this project): the repo contains a GitHub Actions workflow that builds and pushes `dist/` to `gh-pages` on pushes to `main`.
- Or copy the `dist/` contents to `main/docs` and enable Pages to 
