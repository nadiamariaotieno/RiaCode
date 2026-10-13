# RiaCode

RiaCode is a personal desktop IDE project inspired by Visual Studio Code and Cursor.

## Purpose

This project is a hands-on learning experience focused on understanding how modern code editors and development environments work.

## Planned Features

Done so far: syntax highlighting, tabs, light and dark themes, a folder tree, saving files from that folder, creating, renaming, and deleting inside that folder, a command run in that folder, and a second window with its own folder.

1. Git status, diff, and commit.
2. Security Radar, first slice: scan the open folder for secrets and known dependency problems, and show the result from the status bar. Findings stay read-only.
3. Codebase X-Ray, first slice: a graph of which file imports which, and “Show me its connections” for a file.
4. Language intelligence, including symbols and go to definition.
5. Codebase X-Ray, second slice: function calls, and a path from a button through the frontend, API, and database.
6. Understand Mode, the first AI feature. A selection can be explained at Simple, Developer, and Deep Dive levels. It does not edit files.
7. Change Impact Preview. Before an AI edit: files, dependents, security notes, tests, and the diff. The change is approved, rejected, or edited first.
8. Safe Experiment Mode. A Git worktree checkpoint, tests, a comparison, then keep or discard.
9. Security Radar, second slice: insecure code patterns, with a suggested fix that goes through the preview.
10. Flow Mode. A task gathers the files, checklist, tests, and security notes from the steps above, and the task can be resumed.

## Planned Technology Stack

* JavaScript
* React
* Electron
* Monaco Editor
* Tailwind CSS
* Node.js

## Project Status

The desktop window can open a folder, list it, and open, save, create, rename, and delete files and folders there. It can also run one command in that folder. A second window keeps its own folder. Source Control is still sample data.

Next step: Git status, diff, and commit for the open folder.

## Learning Goals

* Understand desktop application architecture
* Learn how code editors manage files and editing state
* Explore process execution and terminal integration
* Practice Git version control
* Apply secure development principles

## Development

This repository contains a React application created with Vite and ESLint.

From this folder:

```powershell
npm install
npm run dev
```

`npm install` installs the dependencies listed in `package.json`.
`npm run dev` starts the Vite development server at http://localhost:5174.
`npm run electron` opens that server in a desktop window. Start `npm run dev` first.

Other scripts:

- `npm run build` writes the production files into `dist`.
- `npm run lint` checks the project with ESLint.
- `npm run preview` serves the production build locally in a browser.

---

Built as a personal learning project.
