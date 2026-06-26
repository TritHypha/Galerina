# Optical I/O and Photonic Networking

Galerina should support optical I/O as a high-speed networking and interconnect
target.

The core rule is:

```text
Galerina should not try to control light directly.
Galerina should understand when a deployment has optical or photonic I/O and
optimise data movement, security, topology, batching and fallback around it.
```

This means optical I/O is not:

```text
normal socket code, but with light
```

It is a deployment capability for moving data across optical-capable
infrastructure. Galerina should treat optical I/O, photonic interconnect,
co-packaged optics, optical Ethernet and optical accelerator-to-accelerator
links as high-bandwidth interconnect layers, not as normal CPU features or
photonic compute targets.

Intel's Optical Compute Interconnect, or OCI, is a useful example of this
direction: an integrated optical I/O chiplet combining photonic and electrical
ICs, designed for co-packaging with CPUs, GPUs, IPUs and SoCs, with
multi-terabit connectivity. Intel Silicon Photonics also describes standard
single-mode fibre support and co-packaged or on-board implementations. Galerina
should model that kind of capability as data movement and topology, not as raw
light control.

## Target Model

Galerina should separate ordinary networks, high-speed networks and optical
interconnects:

```text
network.ethernet
network.wifi
network.fibre
network.rdma
network.roce
network.optical_io
network.co_packaged_optics
network.photonic_interconnect
```

It should also keep these concepts distinct:

```text
photonic_compute
  light used for computation, such as matrix operations or photonic simulation

optical_io
  light used for high-speed data movement and interconnect

photonic_memory
  future optical memory, buffer or pooling concepts
```

`optical_io` is a network, compute-placement and deployment planning target. It
is not a general-purpose compute target by itself.

Example target concept:

```Galerina
network target optical_io {
  kind "photonic_interconnect"

  use_for [
    "ai_cluster",
    "accelerator_to_accelerator",
    "memory_pooling",
    "large_tensor_transfer",
    "distributed_inference"
  ]

  fallback [
    "ethernet",
    "roce",
    "pcie",
    "standard_tcp"
  ]
}
```

This keeps Galerina honest. The application declares that it understands optical
I/O as a deployment capability; it does not pretend to own the optical hardware.

## Data Movement As A First-Class Cost

With optical I/O, the performance question is not only:

```text
How fast is this code?
```

It becomes:

```text
Where is the data?
Where is the model?
Where is the accelerator?
How much data must cross the optical link?
Can Galerina send less?
Can Galerina batch it?
Can Galerina compress it?
Can Galerina keep results near the compute node?
```

The compiler, runtime and deployment planner should estimate:

```text
transfer size
transfer frequency
serialization format
compression choice
encryption overhead
compute placement
data locality
accelerator locality
remote memory usage
fallback path
```

Example report:

```json
{
  "opticalIo": {
    "available": true,
    "kind": "co_packaged_optics",
    "useCase": "ai_cluster",
    "largestTransfer": "embedding_batch",
    "estimatedTransferGb": 38.4,
    "selectedFormat": "tensorBinary",
    "fallbackUsed": false,
    "recommendations": [
      "Use tensorBinary instead of JSON",
      "Increase batch size",
      "Keep model weights on accelerator node",
      "Return compact result instead of full tensor"
    ]
  }
}
```

This is where Galerina can become stronger than ordinary application languages:
it can understand the cost of movement, not just the cost of calculation.

## AI Cluster Use

Optical I/O is most relevant to Galerina when workloads involve large data
movement:

```text
AI cluster communication
accelerator-to-accelerator transfer
distributed inference
distributed training
memory pooling
storage-to-compute pipelines
large tensor transfer
high-bandwidth service communication
vector search
batch embedding generation
image and video AI pipelines
```

AI infrastructure increasingly depends on high-speed fabrics such as RoCE,
high-bandwidth Ethernet and optical interconnects. Galerina should express that as
cluster capability and placement policy:

```Galerina
aiCluster {
  prefer optical_io
  prefer high_bandwidth_ethernet
  prefer rdma
  prefer accelerator_locality
  minimise_data_movement true
}
```

Example task direction:

```Galerina
ai task RunLargeModel {
  compute auto {
    prefer ai_accelerator
    prefer optical_io for tensor_transfer
    minimise data_movement
    fallback ethernet
  }

  memory {
    keep_weights_on_device true
    stream_inputs true
    return_compact_output true
  }
}
```

Galerina should not require developers to hard-code a vendor fabric in normal app
logic. Vendor-specific capabilities belong in deployment profiles, adapter
policy and target reports.

## Topology Awareness

Galerina should not merely detect that a network exists. It should understand the
layout enough to make safer transfer and placement decisions:

```text
CPU node
GPU node
AI accelerator
memory pool
storage node
optical switch
co-packaged optical link
Ethernet fallback
RoCE fallback
PCIe fallback
```

Example topology direction:

```Galerina
topology optical {
  detect nodes
  detect accelerators
  detect memory_pools
  detect storage_nodes
  detect optical_links
  detect fallback_links

  optimise for {
    latency
    bandwidth
    energy_per_bit
    reliability
  }
}
```

The compiler or runtime planner can then produce a plan such as:

```text
Run preprocessing near storage.
Move compact tensor batch over optical link.
Run inference on accelerator group A.
Return only result IDs and confidence scores.
Do not return full intermediate tensors.
```

Shareable reports must avoid exposing private hostnames, private network
topology, raw endpoint identifiers or secret-bearing routing metadata.

## Efficient Transfer Formats

Optical links can be extremely fast, but wasteful formats are still wasteful.

Avoid:

```text
large repeated JSON payload over optical link
full intermediate tensor return
unbatched small messages
uncompressed repeated embeddings
```

Prefer:

```text
schema-compressed records
binary typed tensors
columnar batches
streamed chunks
compressed embeddings
delta updates
compact result objects
zero-copy read-only views where safe
```

Example transfer declaration:

```Galerina
transfer EmbeddingBatch over optical_io {
  format tensorBinary
  batch_size auto
  compression auto
  encryption required
  max_latency 5ms
}
```

Galerina can remain JSON/API-native at human-facing boundaries while compiling
large internal transfers into compact typed formats where the deployment allows
it.

## Security Rules

Optical links are not automatically secure. Data travelling through fibre or a
co-packaged optical link can still be tapped, misrouted, mirrored, logged by
infrastructure or exposed through compromised endpoints.

Galerina optical I/O policy should require:

```text
encryption
authentication
endpoint identity
service identity
key rotation
signed topology
host allowlists
no plaintext fallback
no unknown endpoint transfer
audit logging
redacted reports
```

Example:

```Galerina
optical_io security {
  require encryption
  require mutual_authentication
  require signed_topology
  deny plaintext_fallback
  deny unknown_endpoint
  audit all_transfers
}
```

For enterprise AI:

```Galerina
aiCluster network {
  require encrypted_control_plane
  require encrypted_tensor_transfer for sensitive_data
  require service_identity
  deny unapproved_node_transfer
}
```

Remote memory should not be treated like local RAM. If Galerina supports memory
pooling or remote accelerator memory over optical I/O, it must require typed
access policy, bounds checks, timeout handling, fallback rules, audit logging
and safe redaction.

Example:

```Galerina
remote memory EmbeddingPool {
  access read_only
  encryption required
  max_read 20gb
  timeout 100ms
  fallback local_cache
}
```

## Fallback Behaviour

Optical I/O will not exist on most systems. Galerina should degrade explicitly:

```text
optical_io -> high-speed Ethernet -> RoCE -> normal Ethernet -> local CPU mode -> queue/fail
```

Example:

```Galerina
network auto {
  prefer optical_io
  fallback roce
  fallback ethernet
  fallback local_only

  if fallback_used {
    reduce_batch_size
    increase_timeout
    write_warning_report
  }
}
```

Report:

```json
{
  "networkTarget": "optical_io",
  "selected": "ethernet",
  "fallbackUsed": true,
  "reason": "Optical I/O not detected",
  "performanceImpact": "high",
  "recommendation": "Use smaller batches or deploy to an optical-capable cluster"
}
```

Fallback must not silently weaken security. Plaintext fallback, unknown endpoint
fallback and unaudited remote memory fallback should be denied by default.

## Power Awareness

Optical I/O matters for bandwidth, reach and energy per bit. Galerina should be
able to include energy and placement costs in enterprise AI planning:

```Galerina
optimise for {
  latency
  bandwidth
  energy_per_bit
  accelerator_utilisation
}
```

Example:

```Galerina
deployment ai_cluster {
  prefer optical_io when transfer_gb_per_minute > 100
  prefer local_compute when transfer_cost_too_high
  report energy_estimate
}
```

Energy estimates must be reported as estimates unless backed by measured
adapter data from the deployment.

## Reports

Galerina should produce optical I/O reports when a workload or deployment profile
uses high-speed interconnect planning.

Possible reports:

```text
app.optical-io-report.json
app.interconnect-report.json
app.data-movement-report.json
app.topology-report.json
app.compute-placement-report.json
```

Report fields:

```text
detected interconnect
provider and backend profile
deployment profile
bandwidth estimate
latency estimate
energy estimate
fallback path
data moved per task
largest transfers
serialization format
compression used
remote memory used
accelerator placement
security and encryption status
topology redaction status
warnings and suggested fixes
```

Example:

```json
{
  "interconnect": {
    "type": "optical_io",
    "provider": "intel",
    "mode": "oci",
    "fallback": "ethernet",
    "security": {
      "encryption": "required",
      "endpointIdentity": "required",
      "plaintextFallback": "denied"
    },
    "warnings": [
      {
        "message": "Large JSON transfer detected. Use schemaCompressed or tensorBinary."
      }
    ]
  }
}
```

## Benchmarks

`galerina-tools-benchmark` should eventually include optical I/O diagnostics:

```bash
Galerina benchmark --network optical
Galerina benchmark --network optical --light
Galerina benchmark --network optical --ai-cluster
```

Test areas:

```text
latency
throughput
large tensor transfer
small message transfer
schema-compressed JSON transfer
binary tensor transfer
encryption overhead
fallback speed
multi-node reduce
packet loss and retry behaviour
remote memory read
topology detection
```

Example output:

```json
{
  "benchmark": "optical_io_light",
  "result": {
    "targetDetected": true,
    "largeTensorTransferGbps": 3120,
    "smallMessageLatencyUs": 9,
    "encryptionOverheadPercent": 4.2,
    "fallback": false
  }
}
```

Benchmarks must stay development-only by default and must not auto-run in
production.

## Package Ownership

Recommended ownership:

```text
galerina-core-network
  network target policy, permissions, profiles and network reports

galerina-network-highspeed
  future io_uring, zero-copy, RDMA and RoCE planning, if split out later

galerina-io-optical
  future optical I/O package for photonic interconnect, co-packaged optics and topology

galerina-core-compute
  optical_io target selection, compute placement and data-movement cost planning

galerina-target-photonic
  photonic compute target planning plus optical I/O/interconnect planning reports

galerina-core-vector
  tensor, matrix and batch shape information used for transfer estimates

galerina-core-security
  remote memory, encryption, endpoint identity and redaction policy

galerina-core-reports
  shared report metadata and report-writing contracts

galerina-ai-cluster
  future accelerator-aware distributed AI networking and cluster placement policy

galerina-tools-benchmark
  optical_io benchmark target and fallback diagnostics
```

The future package names should follow `docs/PACKAGE_NAMING.md`. Optical I/O
must not be hidden inside a photonic compute package if it becomes a real data
movement package.

## Non-Goals

Galerina optical I/O planning should not become:

```text
raw light control for normal developers
a claim that Galerina makes optical hardware faster
a replacement for switch, NIC, driver or fibre engineering
a guarantee that fibre traffic is automatically secure
a mandatory AI-cluster feature for normal apps
a production benchmark that runs automatically
```

The design goal is narrower and more useful: safe, typed, encrypted,
topology-aware data movement across optical-capable infrastructure.

## References

- Intel Optical I/O chiplet announcement: <https://newsroom.intel.com/artificial-intelligence/intel-unveils-first-integrated-optical-io-chiplet>
- Intel Silicon Photonics: <https://www.intel.com/content/www/us/en/products/details/network-io/silicon-photonics.html>
- Intel OCI chiplet community article: <https://community.intel.com/t5/Blogs/Tech-Innovation/Artificial-Intelligence-AI/Intel-Shows-OCI-Optical-I-O-Chiplet-Co-packaged-with-CPU-at/post/1582541>
- NVIDIA Spectrum-X Ethernet platform: <https://www.nvidia.com/en-gb/networking/spectrumx/>
- IEEE 802.3 Ethernet Working Group: <https://www.ieee802.org/3/>
