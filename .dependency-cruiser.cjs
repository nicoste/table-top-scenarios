// GENERATED SHAPE, HAND-EDITABLE. Mirrors the dependency graph in
// docs/ARCHITECTURE.md section 3. Regenerate rather than diverge.
module.exports = {
  forbidden: [
    {
      "name": "layer:geometry",
      "severity": "error",
      "comment": "@tt/geometry may only depend on: nothing (ARCHITECTURE.md R-5)",
      "from": {
        "path": "^packages\\/geometry\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/",
        "pathNot": [
          "^packages\\/geometry\\/",
          "^$"
        ]
      }
    },
    {
      "name": "layer:domain",
      "severity": "error",
      "comment": "@tt/domain may only depend on: geometry (ARCHITECTURE.md R-5)",
      "from": {
        "path": "^packages\\/domain\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/",
        "pathNot": [
          "^packages\\/domain\\/",
          "^(packages\\/geometry)\\/"
        ]
      }
    },
    {
      "name": "layer:protocol",
      "severity": "error",
      "comment": "@tt/protocol may only depend on: domain (ARCHITECTURE.md R-5)",
      "from": {
        "path": "^packages\\/protocol\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/",
        "pathNot": [
          "^packages\\/protocol\\/",
          "^(packages\\/domain)\\/"
        ]
      }
    },
    {
      "name": "layer:sim",
      "severity": "error",
      "comment": "@tt/sim may only depend on: domain, geometry, protocol (ARCHITECTURE.md R-5)",
      "from": {
        "path": "^packages\\/sim\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/",
        "pathNot": [
          "^packages\\/sim\\/",
          "^(packages\\/domain|packages\\/geometry|packages\\/protocol)\\/"
        ]
      }
    },
    {
      "name": "layer:persistence",
      "severity": "error",
      "comment": "@tt/persistence may only depend on: domain, protocol (ARCHITECTURE.md R-5)",
      "from": {
        "path": "^packages\\/persistence\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/",
        "pathNot": [
          "^packages\\/persistence\\/",
          "^(packages\\/domain|packages\\/protocol)\\/"
        ]
      }
    },
    {
      "name": "layer:render",
      "severity": "error",
      "comment": "@tt/render may only depend on: domain, geometry (ARCHITECTURE.md R-5)",
      "from": {
        "path": "^packages\\/render\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/",
        "pathNot": [
          "^packages\\/render\\/",
          "^(packages\\/domain|packages\\/geometry)\\/"
        ]
      }
    },
    {
      "name": "layer:ui",
      "severity": "error",
      "comment": "@tt/ui may only depend on: nothing (ARCHITECTURE.md R-5)",
      "from": {
        "path": "^packages\\/ui\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/",
        "pathNot": [
          "^packages\\/ui\\/",
          "^$"
        ]
      }
    },
    {
      "name": "layer:host",
      "severity": "error",
      "comment": "@tt/host may only depend on: sim, persistence, protocol (ARCHITECTURE.md R-5)",
      "from": {
        "path": "^apps\\/host\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/",
        "pathNot": [
          "^apps\\/host\\/",
          "^(packages\\/sim|packages\\/persistence|packages\\/protocol)\\/"
        ]
      }
    },
    {
      "name": "layer:gm",
      "severity": "error",
      "comment": "@tt/gm may only depend on: render, protocol, domain, geometry, ui (ARCHITECTURE.md R-5)",
      "from": {
        "path": "^apps\\/gm\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/",
        "pathNot": [
          "^apps\\/gm\\/",
          "^(packages\\/client-core|packages\\/render|packages\\/protocol|packages\\/domain|packages\\/geometry|packages\\/ui)\\/"
        ]
      }
    },
    {
      "name": "layer:table",
      "severity": "error",
      "comment": "@tt/table may only depend on: render, protocol, domain, geometry, ui (ARCHITECTURE.md R-5)",
      "from": {
        "path": "^apps\\/table\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/",
        "pathNot": [
          "^apps\\/table\\/",
          "^(packages\\/client-core|packages\\/render|packages\\/protocol|packages\\/domain|packages\\/geometry|packages\\/ui)\\/"
        ]
      }
    },
    {
      "name": "layer:client-core",
      "severity": "error",
      "comment": "@tt/client-core may only depend on: domain, geometry, protocol, render (ARCHITECTURE.md R-5)",
      "from": {
        "path": "^packages\\/client-core\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/",
        "pathNot": [
          "^packages\\/client-core\\/",
          "^(packages\\/domain|packages\\/geometry|packages\\/protocol|packages\\/render)\\/"
        ]
      }
    },
    {
      "name": "no-deep-imports",
      "severity": "error",
      "comment": "Across workspaces, import a package by its barrel only (R-6). Inside a workspace, folder structure is free.",
      "from": {
        "path": "^(packages|apps)\\/([^/]+)\\/"
      },
      "to": {
        "path": "^(packages|apps)\\/[^/]+\\/src\\/",
        "pathNot": [
          "^$1\\/$2\\/",
          "^(packages|apps)\\/[^/]+\\/src\\/index\\.ts$"
        ]
      }
    },
    {
      "name": "no-circular",
      "severity": "error",
      "comment": "Cycles are forbidden outright.",
      "from": {},
      "to": {
        "circular": true
      }
    },
    {
      "name": "no-orphans",
      "severity": "warn",
      "comment": "An unreachable module is either dead or unwired.",
      "from": {
        "orphan": true,
        "pathNot": [
          "\\.d\\.ts$",
          "(^|/)(eslint|vitest|vite)\\.config\\.[cm]?[jt]s$",
          "(^|/)src/index\\.ts$"
        ]
      },
      "to": {}
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '(^|/)(dist|node_modules)/' },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
