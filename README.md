# Tract

CLI that turns your git commits into ready-to-post content — blog, X, LinkedIn, YouTube script — in your own voice.

Early WIP, first commit. Nothing to install yet.

```mermaid
flowchart LR
    GITREPO[(Local Git Repo)]
 
    subgraph LOCAL["Local Machine"]
        direction LR
 
        subgraph CLIENTS["Client Layer"]
            CLI["apps/cli\n(Commander.js)"]
            EXT["apps/extension\n(VS Code)"]
        end
 
        API["core/index.ts\n(public API — only import surface)"]
 
        subgraph CORE["packages/core (zero VS Code / CLI deps)"]
            direction TB
            GITMOD["Git Module\ndiff + commit extraction"]
            FILTER{"Significance Filter\nheuristic pre-pass -> LLM judgment\n(timeout + fallback)"}
            CTX["Context Builder\ndiff + README + voice profile"]
            PROMPT["Prompt Builder"]
            LLMIF["LLM Provider\n(interface)"]
            VOICE["Voice Profile"]
            FEEDBACK["Feedback Store\nedit deltas / accept-reject"]
            STORAGEIF["Storage Adapter\n(interface)"]
        end
 
        SQLITE[("Local SQLite/JSON")]
    end
 
    CLAUDE["Claude API\n(external)"]
 
    subgraph PUBLISH["Browser / Platforms"]
        XURL["X — intent URL\n(true one-click, prefilled)"]
        LI["LinkedIn — copy + open\n(manual paste)"]
        MED["Medium — copy + open\n(manual paste)"]
    end
 
    GITREPO --> GITMOD
    CLI --> API
    EXT --> API
    API --> GITMOD
    GITMOD --> FILTER
    FILTER -- "not significant" --> SKIP["Skip, log, wait for next trigger"]
    FILTER -- "significant" --> CTX
    VOICE --> CTX
    CTX --> PROMPT
    PROMPT --> LLMIF
    LLMIF <--> CLAUDE
    LLMIF --> API
    API --> CLI
    API --> EXT
 
    CLI -- "user edits/approves draft" --> FEEDBACK
    EXT -- "user edits/approves draft" --> FEEDBACK
    FEEDBACK --> STORAGEIF
    VOICE --> STORAGEIF
    STORAGEIF --> SQLITE
 
    CLI --> XURL
    CLI --> LI
    CLI --> MED
    EXT --> XURL
    EXT --> LI
    EXT --> MED
 
```

See `PRD.md` for full context.
