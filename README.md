# INT191 · Interactive Database Lab

**Live:** https://phakinza007.github.io/int191-learning/

Standalone deployment of the INT191 learning module, reusing the existing Astro + React components and SQL simulation engine. This repository is independent of the original course website and its deployment.

- Thai / English toggle; light / dark mode and three accent themes
- Twelve independent lessons, interactive PK/FK tables, FD closure explorer and ER diagrams
- JOB_SHEET: UNF → 1NF → 2NF → 3NF → BCNF, anomalies and a separate 3NF-not-BCNF counterexample
- Twenty authored practice questions, progressive hints, timed practice and mistake review
- Twelve SQL examples using a bounded educational simulation in a disposable browser Worker
- Browser-local progress and bookmarks; no login or server database

## Development

Node 24 LTS recommended.

```sh
npm ci
npm run dev -- --background
# http://localhost:4321/int191-learning/
```

Manage the background server with `npx astro dev status`, `npx astro dev logs`, and `npx astro dev stop`. Stop the dev server before a production build.

```sh
npm run check
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

## Deployment

Push to `main` runs type checking, tests and a static build before deploying to GitHub Pages. The public base path is configured in `astro.config.mjs`; update it if the repository name changes.

Only learning components and required runtime assets are included. Original private course notes, authentication, backend endpoints, uploads, member details, database credentials and git history are excluded.

## Limits and accuracy

SQL supports the documented educational subset, not arbitrary MySQL. Data resets on each run. Progress stays on this browser and device; timed sessions restart after reload. Sample data is fictional. Database designs follow the explicitly stated functional dependencies. `unitPrice` is the current catalogue price; historical prices require revised dependencies.

Theory references: [Waterloo FD handout](https://cs.uwaterloo.ca/~david/cs348/handout-FD.pdf), [RPI normalization notes](https://www.cs.rpi.edu/~sibel/csci4380/fall2019/course_notes/normalization.html).

Font: LINE Seed Sans TH, redistributed with its bundled license at `src/assets/fonts/OFL-LINE-Seed.txt`.
