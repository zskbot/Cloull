# Cloull isolated Preview

This repository is built on Cloudflare Pages as an isolated preview while GitHub Actions runner allocation is investigated.

- Project: `cloull-preview`
- Preview branch: `fix/startup-fallback-and-pages-ci`
- Build command: `bun install --frozen-lockfile && bun run lint && bun run build`
- Output directory: `dist`
- Production deployments: disabled
- Main branch: not deployed by this project

The preview is intended for validating the Vite production build and the generated static assets without changing the existing GitHub Pages production site.
