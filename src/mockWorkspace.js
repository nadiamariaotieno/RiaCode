export const sampleProject = {
  name: 'sample-project',
  files: [
    {
      id: 'src',
      name: 'src',
      type: 'folder',
      children: [
        {
          id: 'src/main.jsx',
          name: 'main.jsx',
          type: 'file',
          content: `import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
`,
        },
        {
          id: 'src/App.jsx',
          name: 'App.jsx',
          type: 'file',
          content: `export default function App() {
  return <h1>Hello from the sample project</h1>
}
`,
        },
      ],
    },
    {
      id: 'README.md',
      name: 'README.md',
      type: 'file',
      content: `# sample-project

This file is sample data inside RiaCode.
It is not a file on your disk.
`,
    },
    {
      id: 'package.json',
      name: 'package.json',
      type: 'file',
      content: `{
  "name": "sample-project",
  "private": true
}
`,
    },
  ],
}

export const sampleChanges = [
  { id: 'README.md', label: 'Modified' },
  { id: 'src/App.jsx', label: 'Modified' },
]

export function findFile(nodes, id) {
  for (const node of nodes) {
    if (node.id === id && node.type === 'file') {
      return node
    }
    if (node.children) {
      const found = findFile(node.children, id)
      if (found) {
        return found
      }
    }
  }
  return null
}
