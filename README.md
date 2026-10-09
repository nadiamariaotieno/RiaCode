# RiaCode

RiaCode is a personal desktop IDE project inspired by Visual Studio Code and Cursor.

## Purpose

This project is a hands-on learning experience focused on understanding how modern code editors and development environments work.

## Planned Features

* Code editing with syntax highlighting
* Project and file explorer
* Multiple editor tabs
* Integrated terminal
* Light and dark themes
* Git integration
* AI-powered coding assistance
* Developer-focused security features

## Planned Technology Stack

* JavaScript
* React
* Electron
* Monaco Editor
* Tailwind CSS
* Node.js

## Project Status

The IDE layout is in place and uses sample files. Electron opens the window. Real folders, Monaco, and the terminal are not connected yet.

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
