# Galerina Web Events

`galerina-web-events` defines typed browser event contracts.

Use this package for:

```text
typed click, input, submit and navigation events
event payload validation
debounce and throttle policy
prevent-default and propagation policy
user-gesture requirements
browser permission event reports
event-to-state transition reports
```

It must not expose raw browser event objects directly to normal application
logic. Events should cross into Galerina state through typed, validated and
permissioned boundaries.
