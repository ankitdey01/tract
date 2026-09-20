# Tract

Turns your git commits into ready-to-post content — blog, X, LinkedIn (YouTube script deferred to post-v1) — in your own voice.

Early WIP, first commit. Nothing to install yet.

```mermaid
flowchart LR
    GITREPO[(Local Git Repo)]

    subgraph LOCAL["Local Machine"]
        direction LR

        CLIENTS["User-facing surface\n(CLI first, editor integration later)"]

        subgraph ENGINE["Content Engine (UI-agnostic)"]
            direction TB
            GITMOD["Diff + Commit Extraction"]
            FILTER{"Significance Filter\nJev Noul judgment only\n(--force bypasses)"}
            CTX["Context Builder\ndiff + README + voice profile"]
            GEN["Generation\n(prompt + external LLM, provider TBD)"]
            VOICE["Voice Profile"]
            FEEDBACK["Feedback Store\nedit deltas / accept-reject"]
            STORE[("Global Store ~/.tract\nvoice + drafts per repo/commit")]
        end
    end

    LLM["External LLM API\n(provider TBD)"]

    subgraph PUBLISH["Browser / Platforms"]
        XURL["X — intent URL\n(true one-click, prefilled)"]
        LI["LinkedIn — copy + open\n(manual paste)"]
        MED["Medium — copy + open\n(manual paste)"]
    end

    GITREPO --> GITMOD
    CLIENTS --> ENGINE
    ENGINE --> CLIENTS
    GITMOD --> FILTER
    FILTER -- "not significant" --> SKIP["Skip, log, wait for next trigger"]
    FILTER -- "significant" --> CTX
    VOICE --> CTX
    CTX --> GEN
    GEN <--> LLM
    GEN --> CLIENTS

    CLIENTS -- "user edits/approves draft" --> FEEDBACK
    FEEDBACK --> STORE
    VOICE --> STORE

    CLIENTS --> XURL
    CLIENTS --> LI
    CLIENTS --> MED
```

See `PRD.md` for full context.
