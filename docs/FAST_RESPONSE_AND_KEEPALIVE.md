# Galerina Fast Response And Keep-Alive Strategy

Galerina should treat fast response time as a full request-path problem, not only
a language execution problem.

A Galerina service may respond faster by combining:

- verified boot profiles
- precompiled route lookup tables
- prebuilt request and response validators
- warmed security policy tables
- bounded worker pools
- safe database connection pools
- outbound HTTP connection pools
- inbound HTTP keep-alive
- HTTP/2 multiplexing where available
- strict timeout, rate-limit and backpressure policy

Galerina must not claim to make physical networks faster. Network speed is
controlled by hardware, operating systems, drivers, providers and protocols.
Galerina's role is to reduce avoidable application overhead, reuse safe
connections, reject invalid work early and generate reports explaining runtime
behaviour.

This builds on verified boot profiles: route tables, schema validators, policy
tables, effects maps and package plans should already be known before the first
request arrives.

Keep-alive must be policy-controlled. Production profiles should define idle
timeouts, maximum requests per connection, maximum sockets, maximum free sockets
and shutdown behaviour. Keep-alive must never bypass authentication,
validation, TLS policy, rate limits, body limits, backpressure or secret-safe
logging.

HTTP/1.x keep-alive, HTTP/2 multiplexing and HTTP/3/QUIC should be treated as
transport capabilities selected by deployment profile, not as core language
syntax.

See [Fast Response And Keep-Alive](../../ZTF-Knowledge-Bases/fast-response-and-keep-alive.md) and
[Preplanned Startup And Fast Response](../../ZTF-Knowledge-Bases/preplanned-startup-and-fast-response.md).
