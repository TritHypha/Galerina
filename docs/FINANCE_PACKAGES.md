# Finance Packages

Status: archived post-v2 planning.

The historical archive name is `Galerina-finance-core`. Its previously recorded
machine-local archive location is not a verified current locator. Locate and
verify the retained contents before any restoration; this document does not
establish a replacement package or prove that archived work has been lost.

This document is retained as planning context only. Finance packages must not
be part of the active v1 build graph.

## Purpose

Galerina should treat finance as a serious domain package layer, not as core language
syntax and not as a claim that Galerina is ready to run live trading infrastructure.

The finance opportunity is strongest around safe data handling, typed
messaging, auditability, deterministic maths, market data, event streams,
research workflows and integration with mature systems.

## External Projects To Learn From

QuickFIX is an open-source FIX engine with FIX 4.0 through 5.0 SP2 and
FIXT 1.1 support, language bindings, database-backed stores, SSL/TLS and
pluggable stores/logging. QuickFIX/J is the Java implementation and describes
FIX as a messaging standard for real-time securities transactions.

QuantLib is a free/open-source quantitative finance library for modelling,
trading and risk management. OpenGamma Strata is an open-source analytics and
market-risk Java library with modules for measures, calculation, loaders,
pricers, market data, products, data and basics.

Apache Kafka is a distributed event-streaming platform used for high-performance
data pipelines, streaming analytics, integration and mission-critical
applications. FINOS FDC3 is an open standard for financial desktop applications
to interoperate through app launching, context sharing and intents.

OpenBB shows the value of connecting proprietary, licensed and public financial
data sources into research notebooks, REST APIs, dashboards and AI-agent workflows. GS Quant
shows how notebook-oriented tooling remains important for quant research, derivatives analysis,
trading strategies and risk-management workflows, while some APIs require
institutional credentials.

References:

- https://github.com/quickfix/quickfix
- https://github.com/quickfix-j/quickfixj
- https://www.quantlib.org/
- https://github.com/OpenGamma/Strata
- https://github.com/apache/kafka
- https://github.com/finos/FDC3
- https://github.com/OpenBB-finance/OpenBB
- https://github.com/goldmansachs/gs-quant

## Package Strategy

Start grouped:

```text
packages-ts/Galerina-finance-core/
```

Split later only after contracts are stable:

```text
packages-ts/Galerina-finance-core-math/
packages-ts/Galerina-finance-core-calendar/
packages-ts/Galerina-finance-core-market-data/
packages-ts/Galerina-finance-core-order/
packages-ts/Galerina-finance-core-fix/
packages-ts/Galerina-finance-core-audit/
packages-ts/Galerina-finance-core-compliance/
packages-ts/Galerina-finance-core-risk/
packages-ts/Galerina-finance-core-pricing/
packages-ts/Galerina-finance-core-products/
packages-ts/Galerina-finance-core-scenarios/
packages-ts/Galerina-finance-core-fdc3/
```

Keep general infrastructure outside finance:

```text
packages-ts/Galerina-stream/
packages-ts/Galerina-stream-kafka/
packages-ts/Galerina-schema-registry/
packages-ts/Galerina-ffi/
packages-ts/Galerina-ffi-cpp/
packages-ts/Galerina-ffi-java/
packages-ts/Galerina-ffi-python/
packages-ts/Galerina-replay/
packages-ts/galerina-core-runtime-low-latency/
```

## First Phase

Build contracts in this order:

```text
Galerina-finance-core-math
Galerina-finance-core-calendar
Galerina-finance-core-market-data
Galerina-finance-core-audit
Galerina-finance-core-fix
```

This keeps the beta realistic. Galerina should first prove it can model financial
data, rounding, identifiers, timestamps, market events, validation and audit
evidence safely.

## Later Phases

After the base contracts are stable:

```text
Galerina-stream-kafka
Galerina-schema-registry
Galerina-ffi-cpp
Galerina-ffi-java
Galerina-ffi-python
Galerina-finance-core-risk
Galerina-finance-core-pricing
Galerina-finance-core-fdc3
galerina-core-runtime-low-latency
Galerina-replay
```

Interop should be controlled by policy. A Galerina app may wrap mature external
finance systems, but the wrapper must declare memory isolation,
network permissions, credentials policy, audit requirements and fallback
behaviour.

## Non-Goals

Do not start finance support by building:

```text
full stock exchange matching engine
HFT engine
broker-dealer platform
settlement system
clearing system
custody platform
trading advice engine
```

These are regulated and high-risk systems. Galerina beta work should focus on typed
contracts, validation, replay, audit and safe integration first.
