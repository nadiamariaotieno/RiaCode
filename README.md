# RiaCode

RiaCode is a personal desktop IDE project inspired by Visual Studio Code and Cursor.

## Purpose

This project is a hands-on learning experience focused on understanding how modern code editors and development environments work.

## Planned Features

Done so far: syntax highlighting, tabs, light and dark themes, a folder tree, saving files from that folder, creating, renaming, and deleting inside that folder, a command run in that folder, a second window with its own folder, Git status, diff, stage, and commit for that folder, a read-only security scan of that folder, an import graph for a file in that folder, and symbols plus go to definition for a JavaScript file.

1. Codebase X-Ray, second slice: function calls, and a path from a button through the frontend, API, and database.
2. Understand Mode, the first AI feature. A selection can be explained at Simple, Developer, and Deep Dive levels. It does not edit files.
3. Change Impact Preview. Before an AI edit: files, dependents, security notes, tests, and the diff. The change is approved, rejected, or edited first.
4. Safe Experiment Mode. A Git worktree checkpoint, tests, a comparison, then keep or discard.
5. Security Radar, second slice: insecure code patterns, with a suggested fix that goes through the preview.
6. Flow Mode. A task gathers the files, checklist, tests, and security notes from the steps above, and the task can be resumed.

## Planned Technology Stack

* JavaScript
* React
* Electron
* Monaco Editor
* Tailwind CSS
* Node.js

## Project Status

The desktop window can open a folder, list it, and open, save, create, rename, and delete files and folders there. It can also run one command in that folder. A second window keeps its own folder. Source Control reads Git for that folder: status, diff, stage, and commit. The folder must be the repository itself. Sample changes still appear when no folder is open. Security scans that folder for secrets and asks npm about known dependency problems. The scan does not change files. X-Ray shows which files import the open file, and which files it imports. Outline lists the functions and values in a JavaScript file, and go to definition can follow an import inside the open folder.

Next step: Codebase X-Ray, second slice — function calls, and a path from a button through the frontend, API, and database.

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
