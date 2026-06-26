# Galerina Web State

`galerina-web-state` defines browser client state, typed state transition and
render-diff contracts.

Use this package for:

```text
typed page state
loading, error and partial-data state contracts
API response to state conversion
state transition reports
state diff plans
hydration and rehydration contracts
streaming batch state updates
client-state report contracts
```

It must not become a global mutable state framework or hide unsafe data trust
transitions. Data from APIs, storage, URL parameters, events and workers must
remain untrusted until validated and converted into typed state.
