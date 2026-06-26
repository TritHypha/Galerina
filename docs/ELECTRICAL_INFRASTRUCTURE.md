# Electrical Infrastructure Packages

Status: archived post-v2 planning.

Electrical and OT package folders have been moved out of the active workspace
to:

```text
C:\laragon\www\Galerina_Archive\packages-galerina\Galerina-electrical-core
C:\laragon\www\Galerina_Archive\packages-galerina\Galerina-ot-core
```

This document is retained as planning context only. Electrical and OT packages
must not be part of the active v1 build graph.

## Positioning

Galerina can support electrical systems and infrastructure as a typed, secure and
auditable modelling, monitoring and workflow layer.

Core rule:

```text
Galerina should not replace circuit breakers, relays, protective devices, PLC safety
systems, grid protection, certified controllers or qualified electrical design.

Galerina can help model, validate, monitor, document, automate and audit electrical
infrastructure safely.
```

Electrical support must start above the physical equipment:

```text
sensors / meters / relays / PLCs / BMS / SCADA
  -> Galerina typed integration layer
  -> validation, monitoring, alerts, reports
  -> archive, dashboards, compliance evidence
```

## Scope

Electrical infrastructure may include:

```text
building electrical systems
industrial power distribution
control panels
switchgear
UPS systems
solar and battery systems
EV chargers
substations
microgrids
data-centre power
factory electrical monitoring
energy metering
SCADA and OT integrations
```

Galerina package work may model these systems, but it must not claim to certify
designs, replace protection settings studies, perform unsupervised switching or
act as a safety system.

## Package Direction

Use grouped beta package areas first:

```text
Galerina-electrical-core
Galerina-ot-core
```

Future electrical subpackages may include:

```text
Galerina-electrical-assets
Galerina-electrical-monitoring
Galerina-electrical-energy
Galerina-electrical-capacity
Galerina-electrical-maintenance
Galerina-electrical-protection-records
Galerina-electrical-reports
```

Future OT protocol packages should use `Galerina-ot-*`, because protocols such as
OPC UA, Modbus, MQTT, SCADA connectors and IEC 61850 are not only electrical:

```text
Galerina-ot-opcua
Galerina-ot-iec61850
Galerina-ot-modbus
Galerina-ot-mqtt
Galerina-ot-scada
```

## Standards Context

IEC 61850 is relevant to power utility automation and intelligent electronic
device communication, especially substation and smart-grid style contexts.

OPC UA is relevant for interoperable industrial data exchange across OT, IT and
cloud systems.

ISA/IEC 62443 is relevant for cybersecurity in industrial automation and
control systems.

NIST NCCoE guidance notes that connecting OT systems to IT systems can improve
operations but also increases exposure to cyber threats.

Galerina documentation should reference these standards as integration and security
context, not as claims of compliance.

References:

- IEC 61850 overview via EIRIE:
  <https://ses.jrc.ec.europa.eu/eirie/en/standard-regulations/communication-networks-and-systems-power-utility-automation-part-1>
- ISA/IEC 62443 series overview:
  <https://www.isa.org/standards-and-publications/isa-standards/isa-iec-62443-series-of-standards>
- NIST NCCoE industrial control system integrity project:
  <https://www.nccoe.nist.gov/manufacturing/protecting-information-and-system-integrity-industrial-control-system-environments>

## Asset Modelling

`Galerina-electrical-core` should define typed asset contracts:

```text
Panel
Circuit
Breaker
Cable
Load
Meter
Transformer
Inverter
Battery
EVCharger
UPS
Generator
Relay
Sensor
```

Example direction:

```Galerina
electrical panel MainPanel {
  voltage 400V
  phases 3
  frequency 50Hz
  maxCurrent 250A

  circuits {
    circuit "CNC-Router-01" {
      breaker 32A
      cable "6mm2"
      loadType motor
      criticality high
    }

    circuit "Office-Lighting" {
      breaker 10A
      loadType lighting
      criticality low
    }
  }
}
```

The first output should be an electrical asset report, not runtime control.

## Telemetry and Monitoring

Galerina may process live or periodic telemetry:

```text
voltage
current
power
power factor
frequency
phase imbalance
harmonics
temperature
breaker state
relay state
battery state of charge
solar generation
EV charger demand
UPS load
```

Example direction:

```Galerina
electrical monitor FactoryPower {
  source Meter("main-incomer")

  read {
    voltage
    current
    powerKw
    powerFactor
    frequency
    phaseImbalance
  }

  alert {
    if voltage outside 230V +/- 10% notify maintenance
    if phaseImbalance > 5% for 60s notify electricalEngineer
    if powerFactor < 0.85 for 10m create investigation
  }
}
```

## Safe Command Boundaries

Galerina must distinguish monitoring from control:

```text
read telemetry        = lower risk
create alert          = lower risk
open work order       = lower risk
change setpoint       = higher risk
switch load           = high risk
open/close breaker    = very high risk
override protection   = deny
```

Default policy:

```Galerina
electrical control {
  default deny

  allow readMeterData
  allow readBreakerState
  allow createMaintenanceAlert

  allow changeNonCriticalSetpoint with approval
  allow shedNonCriticalLoad with automationPolicy

  deny overrideProtection
  deny disableInterlock
  deny forceBreakerClose
  deny unsafeRemoteSwitching
}
```

Normal Galerina scripts must not casually operate electrical equipment. High-risk
control must require explicit policy, signed jobs, operator approval, local
interlocks and package/runtime support designed for that environment.

## Capacity and Energy

Galerina may model:

```text
total connected load
estimated demand
peak demand
circuit capacity
panel capacity
phase balancing
UPS runtime
generator capacity
battery capacity
solar export/import
EV charger load management
```

Energy optimisation may include reporting and recommendations for peak tariff
avoidance, battery scheduling, EV charging, power-factor issues, abnormal
consumption and solar/battery/grid balance. Automated load control must remain
behind safe command boundaries.

## Protection Settings Records

Galerina can help manage protection setting records, but not replace relays or
protection devices.

Allowed package responsibilities:

```text
relay setting records
version control
change approval
engineering review
test evidence
rollback records
coordination check evidence
device compatibility reports
```

Example direction:

```Galerina
protection settings MainIncomerRelay {
  source "./relay-settings/main-incomer.json"

  require engineeringApproval
  require testRecord
  require rollbackPlan

  deny directRuntimeEdit
}
```

## OT Cybersecurity

Electrical infrastructure integrations must default to strict OT security:

```text
network segmentation
read-only by default
host allowlists
signed commands
operator approval
mTLS
no internet access from electrical control networks
no arbitrary scripts
no package network access unless declared
no plaintext protocols in production where avoidable
audit all control attempts
```

Example direction:

```Galerina
ot network ElectricalOT {
  default deny

  allow read OPCUA from ["meter-gateway-01"]
  allow read IEC61850 from ["substation-gateway-01"]

  deny internetAccess
  deny shell.run
  deny unknownOutboundHosts
  deny writeControl unless signedJob and approvedOperator
}
```

## Reports

Electrical and OT packages should be report-heavy:

```text
site.electrical-asset-report.json
site.capacity-report.json
site.energy-report.json
site.ot-network-report.json
site.protection-settings-report.json
site.maintenance-report.json
site.event-audit-report.json
site.compliance-report.json
site.failure-report.json
```

Reports must avoid raw secrets, unnecessary personal data and unsafe control
payloads.

## First Version

Start with safe, read-only and audit-focused features:

```text
electrical asset models
meter and telemetry ingestion
alerts and reports
capacity checks
maintenance schedules
energy reports
OT network policy
protection setting version/audit records
```

Avoid first:

```text
direct breaker control
relay protection replacement
PLC replacement
safety interlock control
unsupervised switching
real-time grid control
```

## Non-Goals

Galerina electrical package work must not:

```text
replace certified electrical protection equipment
replace PLC safety systems
replace qualified electrical engineering judgement
claim compliance with electrical or OT cybersecurity standards by default
perform unsupervised switching
override protection or interlocks
hide operator actions or maintenance bypasses
store secrets in event logs
```

Final rule:

```text
Model, monitor, validate, report and audit first.
Control only through explicit, reviewed, high-assurance package boundaries.
Never replace certified protection or safety systems.
```
