# Galerina Image AI Package Boundaries and Compute Auto

Galerina, short for **Galerina**, is a strict, memory-safe, security-first programming language and compiler/toolchain.

Galerina source files use the `.spore` extension.

Example files:

```text
boot.spore
main.spore
routes.spore
models.spore
image-provider-example.spore
image-policy.spore
```

---

## Summary

This document defines how Galerina should safely support **image AI packages, image processing packages and vision model workflows** without making image processing a native language feature.

Galerina should not become:

```text
an image editor
an image processing engine
an OCR platform
a computer vision framework
an AI image generation platform
an image search engine
a provider-specific vision SDK
```

Galerina should provide safe primitives that image packages can use:

```text
typed inputs
typed outputs
typed errors
binary data
file streams
effects
permissions
safe file access
timeouts
rate limits
memory limits
runtime profiles
compute auto
source maps
compiler reports
package reports
security reports
target reports
memory reports
```

Image AI systems should be implemented through:

```text
packages
model providers
frameworks
applications
external services
tooling
```

not through native Galerina language features.

---

## Classification

```text
Area: Image AI, image processing and vision workflows
Native language feature: No
Supported through Galerina primitives: Yes
Belongs in: Packages, model providers, frameworks, tooling, external services
```

---

## Core Principle

Galerina should not say:

```text
Galerina natively supports image classification.
Galerina natively supports image detection.
Galerina natively supports image segmentation.
Galerina natively supports edge detection.
Galerina natively supports image embeddings.
Galerina natively supports image generation.
Galerina natively supports image processing.
```

Galerina should say:

```text
Galerina supports safe typed boundaries that image AI and image processing packages can use.
```

The correct model is:

```text
Galerina core:
  safe language primitives

Galerina standard library:
  low-level utilities such as files, streams, binary data, errors, time and reports

Galerina packages:
  image decoders
  image encoders
  vision models
  image classifiers
  detection packages
  segmentation packages
  feature extraction packages
  image embedding packages

Galerina frameworks:
  upload workflows
  image review screens
  moderation dashboards
  visual search workflows
  media management workflows

Applications:
  accepted formats
  image size limits
  privacy rules
  provider choice
  model choice
  business behaviour
  storage rules

External services:
  image AI APIs
  OCR APIs
  moderation APIs
  image search services
  image generation services
  model hosting
  cloud storage
```

---

# 1. What Galerina Provides

Galerina may provide general-purpose primitives such as:

```text
Binary
Buffer
FileRef
FileStream
ByteStream
Text
Json
Result<T, Error>
Option<T>
typed records
typed errors
effects
permissions
network.outbound
network.inbound
file.read
file.write
env.read
compute.run
memory.large
SecureString
timeouts
rate limits
memory limits
structured errors
source maps
compiler reports
package reports
security reports
target reports
runtime profiles
```

These primitives are useful for image packages, but they are not image features by themselves.

---

# 2. What Image Packages Provide

Image packages may define types such as:

```text
Image
ImageMask
MaskData
EdgeMap
ClassificationLabel
DetectedObject
BoundingBox
ConfidenceScore
SimilarityScore
ImageFeatures
ImageEmbedding
ImageDocument
ImageSearchResult
ImageGenerationRequest
ImageGenerationResult
```

They may also define task patterns such as:

```text
ImageClassification
ImageDetection
ImageSegmentation
EdgeDetection
RegionDetection
PatternDetection
FeatureExtraction
ImageEmbedding
ImageSimilarity
ImagePreprocessing
ImageGeneration
ImageModeration
ImageSearch
```

These should be package-defined or standard-library-candidate patterns, not required Galerina core language features.

---

# 3. What Frameworks Provide

Frameworks may provide:

```text
image upload forms
image galleries
image editors
image review screens
image moderation dashboards
visual search interfaces
image tagging workflows
media library workflows
admin screens
human review queues
```

These should not be native Galerina features.

---

# 4. What Applications Decide

Applications should decide:

```text
which image formats are allowed
which maximum dimensions are allowed
which file sizes are allowed
which image models are used
which image providers are used
whether metadata is stripped
whether generated images are allowed
whether uploaded images are stored
which users can access images
which moderation rules apply
which outputs require human review
```

Galerina should not hard-code these decisions.

---

# 5. What External Services Provide

External services may provide:

```text
image classification
object detection
image segmentation
image generation
image moderation
OCR
visual search
image embeddings
image hosting
model hosting
cloud storage
```

Galerina packages may integrate with these systems.

Galerina core should not hard-code provider-specific behaviour.

---

# 6. Image Policy

Image policy should be project or package configuration.

Example:

```Galerina
image_policy {
  max_width 4096
  max_height 4096
  max_file_size 20mb
  max_decoded_memory 256mb

  allowed_formats [
    "png",
    "jpg",
    "jpeg",
    "webp"
  ]

  decode_errors "fail"
  metadata_policy "strip"

  security {
    decoder_sandbox true
    unsafe_native_decoders "deny_by_default"
    timeout 10s
  }

  reports {
    image_report true
    memory_report true
    security_report true
    target_report true
  }
}
```

Galerina may support policy validation, effects, permission checks and reports.

The image package decides how the image-specific policy is applied.

---

# 7. Image Validation

Image packages should validate:

```text
file size
image dimensions
image format
decoded memory size
metadata policy
colour space
alpha channel
malformed image data
unsafe decoder behaviour
```

Example error:

```text
Image validation error:
Image exceeds max dimensions.

Max:
  4096 x 4096

Received:
  8192 x 8192
```

Galerina should support structured errors and reports.

The image package performs the image-specific validation.

---

# 8. Image Effects

Galerina should provide general effects.

Core effects may include:

```text
file.read
file.write
network.inbound
network.outbound
env.read
compute.run
memory.large
```

Image packages may define package-level effects such as:

```text
image.decode
image.encode
image.analyse
image.generate
image.moderate
image.extract_features
image.search
```

These should not be required Galerina core effects.

They are useful package-defined permissions.

---

# 9. Image Classification Example

Image classification is not a native Galerina feature.

It belongs in an image package or external provider.

Example package-level flow:

```Galerina
secure flow classifyImage(imageFile: FileRef) -> Result<ClassificationLabel, ImageError>
effects [file.read, compute.run] {
  let imageBytes = file.readBytes(imageFile)?

  return ImageClassificationPackage.classify {
    image imageBytes
  }?
}
```

Galerina provides:

```text
FileRef
file.read
Binary
Result<T, Error>
effects
compute.run
structured errors
source maps
reports
```

The package provides:

```text
ClassificationLabel
ImageError
image decoding
classification model
classification output
```

---

# 10. Image Detection Example

Image detection belongs in packages.

Example:

```Galerina
secure flow detectObjects(imageFile: FileRef) -> Result<Array<DetectedObject>, ImageError>
effects [file.read, compute.run] {
  let imageBytes = file.readBytes(imageFile)?

  return ImageDetectionPackage.detect {
    image imageBytes
  }?
}
```

Package-defined types:

```Galerina
type BoundingBox {
  x: Decimal
  y: Decimal
  width: Decimal
  height: Decimal
}

type DetectedObject {
  label: String
  confidence: Float
  box: BoundingBox
}
```

Galerina should not define the detection model, label set or bounding-box logic as native language features.

---

# 11. Image Segmentation Example

Image segmentation belongs in packages.

Example:

```Galerina
secure flow segmentImage(imageFile: FileRef) -> Result<ImageMask, ImageError>
effects [file.read, compute.run] {
  let imageBytes = file.readBytes(imageFile)?

  return ImageSegmentationPackage.segment {
    image imageBytes
  }?
}
```

Package-defined type:

```Galerina
type ImageMask {
  width: Int
  height: Int
  classes: Array<String>
  data: MaskData
}
```

Galerina provides safe boundaries and reports.

The package provides the segmentation model.

---

# 12. Edge Detection Example

Edge detection belongs in packages.

It may be algorithmic or model-based.

Example:

```Galerina
secure flow detectEdges(imageFile: FileRef) -> Result<EdgeMap, ImageError>
effects [file.read, compute.run] {
  let imageBytes = file.readBytes(imageFile)?

  return EdgeDetectionPackage.detect {
    image imageBytes
  }?
}
```

Package-defined type:

```Galerina
type Edgematch {
  width: Int
  height: Int
  data: MaskData
}
```

---

# 13. Feature Extraction Example

Image feature extraction belongs in packages.

Example:

```Galerina
secure flow extractImageFeatures(imageFile: FileRef) -> Result<ImageFeatures, ImageError>
effects [file.read, compute.run] {
  let imageBytes = file.readBytes(imageFile)?

  return ImageFeaturePackage.encode {
    image imageBytes
  }?
}
```

Friendly package type:

```Galerina
type ImageFeatures
```

Advanced package detail:

```Galerina
type ImageFeatureVector = Vector<1024, Float16>
```

Normal application code should not need to expose low-level vector or tensor details.

---

# 14. Image Embedding Example

Image embeddings are package-defined.

Example:

```Galerina
secure flow createImageEmbedding(imageFile: FileRef) -> Result<ImageEmbedding, ImageError>
effects [file.read, compute.run] {
  let imageBytes = file.readBytes(imageFile)?

  return ImageEmbeddingPackage.encode {
    image imageBytes
  }?
}
```

Galerina should not natively define embedding dimensions, model compatibility or vector formats.

Packages should report them.

---

# 15. Image Similarity Example

Image similarity belongs in packages.

Example:

```Galerina
secure flow compareImages(
  leftFile: FileRef,
  rightFile: FileRef
) -> Result<SimilarityScore, ImageError>
effects [file.read, compute.run] {
  let leftBytes = file.readBytes(leftFile)?
  let rightBytes = file.readBytes(rightFile)?

  let leftFeatures = ImageFeaturePackage.encode {
    image leftBytes
  }?

  let rightFeatures = ImageFeaturePackage.encode {
    image rightBytes
  }?

  return SimilarityPackage.cosine {
    left leftFeatures
    right rightFeatures
  }?
}
```

The package provides feature extraction and similarity logic.

Galerina provides typed boundaries, effects and reports.

---

# 16. Image Search Example

Image search is not a native Galerina feature.

It combines image packages and search/vector packages.

Example:

```Galerina
secure flow searchSimilarImages(imageFile: FileRef) -> Result<SearchResults<ImageDocument>, SearchError>
effects [file.read, compute.run, network.outbound] {
  let imageBytes = file.readBytes(imageFile)?
  let embedding = ImageEmbeddingPackage.encode { image imageBytes }?

  return ImageSearchProvider.search<ImageDocument> {
    embedding embedding
    top_k 20
    metric "cosine"
  }?
}
```

The packages provide:

```text
ImageEmbeddingPackage
ImageSearchProvider
SearchResults<T>
SearchError
ImageDocument
```

Galerina provides:

```text
file.read
compute.run
network.outbound
typed boundaries
structured errors
reports
```

---

# 17. Image Generation Example

Image generation is not a native Galerina feature.

It belongs in packages or external services.

Example:

```Galerina
secure flow generateImage(prompt: Text) -> Result<Image, ImageError>
effects [compute.run] {
  return ImageGenerationPackage.generate {
    prompt prompt
  }?
}
```

External provider version:

```Galerina
secure flow generateImageWithProvider(prompt: Text) -> Result<Image, ImageError>
effects [network.outbound] {
  return ImageGenerationProvider.generate {
    prompt prompt
  }?
}
```

Important rule:

```text
Generated images should be treated as generated content, not trusted evidence.
```

---

# 18. Model Binding

Packages may bind models to image task patterns.

Example:

```Galerina
model SegmentationModel {
  input Image
  output ImageMask

  precision {
    input Float16
    compute Float16
    accumulate Float32
    output Float32
  }

  targets {
    prefer [ai_accelerator, gpu, cpu]
    fallback true
  }
}
```

Application code stays simple:

```Galerina
secure flow segmentImage(imageFile: FileRef) -> Result<ImageMask, ImageError>
effects [file.read, compute.run] {
  return ImageSegmentationPackage.segment {
    file imageFile
  }?
}
```

---

# 19. Compute Auto for Image Packages

`compute auto` is a general Galerina compute feature.

It is not image-specific.

Image packages may use `compute auto` for model-heavy or numeric work.

Good candidates:

```text
image classification model inference
object detection
image segmentation
edge detection
feature extraction
image embeddings
image similarity
image generation
batch image processing
```

Poor candidates:

```text
file loading
network requests
database writes
API routing
permission checks
final business decisions
exact security decisions
metadata stripping
```

Recommended split:

```text
image loading / validation / safety:
  CPU exact logic

model inference:
  compute auto

final decision / storage / response:
  CPU exact logic
```

---

# 20. Target Preferences

Galerina should allow target preferences at different levels:

```text
global compute policy in boot.spore
package-level targets
model-level targets
flow-level override
explicit compute target for advanced users
```

Recommended priority:

```text
explicit flow target
model target policy
package target policy
boot.spore global policy
safe CPU fallback
```

Global example:

```Galerina
compute {
  target_selection "auto"

  prefer [
    ai_accelerator,
    gpu,
    cpu_vector,
    cpu
  ]

  fallback true

  reports {
    target_report true
    memory_report true
    precision_report true
    fallback_report true
    ai_guide true
  }
}
```

---

# 21. Flow-Level Target Override

Most flows should not need this.

Advanced override:

```Galerina
secure flow segmentImage(imageFile: FileRef) -> Result<ImageMask, ImageError>
effects [file.read, compute.run] {
  compute target gpu required {
    return ImageSegmentationPackage.segment {
      file imageFile
    }
  }
}
```

Photonic test override:

```Galerina
secure flow segmentImage(imageFile: FileRef) -> Result<ImageMask, ImageError>
effects [file.read, compute.run] {
  compute target photonic_mzi required {
    return ImageSegmentationPackage.segment {
      file imageFile
    }
  }
}
```

---

# 22. Photonic Support for Image Packages

Photonic support should be allowed only when suitable.

Good photonic candidates:

```text
matrix-heavy model layers
convolution lowering where supported
feature extraction
dense layers
linear transforms
optical preprocessing
some segmentation/classification model internals
```

Poor photonic candidates:

```text
file loading
image decoding
JSON/API handling
final business decisions
security logic
database writes
exact accounting
metadata stripping
permission checks
```

Photonic target names should be optional target/plugin names, not required Galerina core features.

---

# 23. Photonic MZI for Image Models

`photonic_mzi` may be suitable for matrix/vector-style parts of image models.

Example model target:

```Galerina
model SegmentationModel {
  targets {
    prefer [photonic_auto, gpu, cpu]
    fallback true
  }

  verify {
    cpu_reference true
    max_error 0.001
  }
}
```

Galerina should only choose a photonic target if:

```text
the operation maps to supported matrix/vector compute
hardware is available through a plugin
calibration is valid
precision/tolerance is acceptable
fallback exists
verification policy passes
```

---

# 24. Image AI Precision

Image AI often uses approximate numeric precision.

Recommended precision types:

```text
Float32
Float16
BFloat16
FP8 where supported
INT8 quantised models
```

Example:

```Galerina
precision {
  input Float16
  compute Float16
  accumulate Float32
  output Float32
  tolerance 0.001
}
```

For beginner code, precision should usually live in the model or package definition, not the flow.

Precision changes must be reported.

---

# 25. Security Rules

Image processing can be risky because images may be user-supplied, malformed or deliberately hostile.

Galerina should support rules and reports that help enforce:

```text
max image file size
max decoded memory
allowed image formats
metadata stripping
no shell execution by default
explicit package permissions
no unsafe native decoder unless approved
sandboxed image decoder where possible
timeout on image processing
memory limit on image processing
external providers require network permission
generated images are marked as generated content
```

Example:

```Galerina
security {
  image_processing {
    max_file_size 20mb
    max_decoded_memory 256mb
    metadata "strip"
    decoder_sandbox true
    timeout 10s
  }
}
```

---

# 26. Effects and Purity

Image classification, detection and segmentation should avoid side effects once the image data is prepared.

Good pattern:

```Galerina
secure flow classifyImage(imageFile: FileRef) -> Result<ClassificationLabel, ImageError>
effects [file.read, compute.run] {
  return ImageClassificationPackage.classify {
    file imageFile
  }?
}
```

Loading files, reading APIs or writing databases is not pure.

Model-heavy work should be isolated from I/O and business decisions.

---

# 27. API Example: Image Segmentation

```Galerina
api ImageApi {
  POST "/images/segment" {
    request ImageUploadRequest
    response ImageSegmentationResponse
    timeout 15s
    max_body_size 20mb
    handler segmentImageEndpoint
  }
}
```

Handler:

```Galerina
secure flow segmentImageEndpoint(req: Request) -> Result<Response, ApiError>
effects [network.inbound, file.read, compute.run] {
  let upload: ImageUploadRequest = json.decode<ImageUploadRequest>(&req.body)?

  let mask: ImageMask = ImageSegmentationPackage.segment {
    file upload.file
  }?

  return JsonResponse(ImageSegmentationResponse {
    mask mask
  })
}
```

The API is application/framework code.

The segmentation capability is package code.

Galerina provides safe typed boundaries.

---

# 28. Batch Processing Example

Batch image processing is a good compute-auto candidate.

Example:

```Galerina
secure flow segmentImageBatch(images: Array<FileRef>) -> Result<Array<ImageMask>, ImageError>
effects [file.read, compute.run] {
  return ImageSegmentationPackage.segmentBatch {
    files images
  }?
}
```

Good targets:

```text
AI accelerator
GPU
CPU vector
CPU fallback
photonic candidate where suitable
```

---

# 29. Package Support

Image models, decoders and processors should come from packages.

Example:

```Galerina
packages {
  use VisionModels from vendor "./vendor/vision-models" {
    version "1.0.0"

    permissions {
      file_read "allow"
      file_write "deny"
      network "deny"
      environment "deny"
      shell "deny"
      native_bindings "deny"
      unsafe "deny"
    }

    loading {
      mode "lazy"
      share_instance true
    }
  }
}
```

Usage:

```Galerina
use VisionModels
```

Package rules:

```text
image packages should not get network access unless required
image packages should not get shell access by default
model files should be loaded through explicit file permissions
native decoders should be audited
large memory usage should be reported
unsafe features should be visible in package reports
```

---

# 30. External Runtime Interop Option

Some image AI tooling may initially depend on external runtimes.

Example:

```Galerina
packages {
  use VisionRuntime from external_runtime "vision-tools" {
    version "0.18.0"

    permissions {
      file_read "allow"
      file_write "deny"
      network "deny"
      environment "deny"
      shell "deny"
    }

    runtime {
      mode "isolated"
      timeout 30s
      memory_limit 1gb
    }
  }
}
```

This should be treated as interop, not native Galerina image AI support.

External vision packages require sandboxing, permission reports and runtime limits.

---

# 31. File Safety Connection

Image AI tasks may process uploaded files.

Galerina should ensure:

```text
uploaded images are not executable
image metadata is stripped if configured
image decoder is sandboxed where possible
output paths are approved
bulk processing respects ransomware guard
packages cannot write files unless approved
image tools cannot execute embedded content
```

This connects to:

```text
ransomware-resistant design
package permissions
file access policy
security access policy
```

---

# 32. Generated Target Report

Example:

```json
{
  "imagePackageTargetReport": {
    "package": "ImageSegmentationPackage",
    "flow": "segmentImage",
    "source": "src/image/segment.spore:4",
    "computeMode": "auto",
    "model": "SegmentationModel",
    "selectedTarget": "gpu",
    "preferredTargets": [
      "photonic_auto",
      "ai_accelerator",
      "gpu",
      "cpu"
    ],
    "fallbackUsed": true,
    "fallbackReason": "photonic_auto not available",
    "input": {
      "type": "FileRef",
      "width": 1024,
      "height": 1024
    },
    "output": {
      "type": "ImageMask"
    }
  }
}
```

---

# 33. Generated Precision Report

```json
{
  "precisionReport": {
    "package": "ImageSegmentationPackage",
    "model": "SegmentationModel",
    "precision": {
      "input": "Float16",
      "compute": "Float16",
      "accumulate": "Float32",
      "output": "Float32",
      "tolerance": 0.001
    },
    "verification": {
      "cpuReference": true,
      "maxError": 0.001
    }
  }
}
```

---

# 34. Generated Memory Report

```json
{
  "imageMemoryReport": {
    "flow": "segmentImage",
    "inputImage": {
      "width": 1024,
      "height": 1024,
      "decodedMemory": "12mb"
    },
    "selectedTarget": "gpu",
    "estimatedDeviceMemory": "420mb",
    "withinLimit": true
  }
}
```

---

# 35. Generated Security Report

```json
{
  "imageSecurityReport": {
    "flow": "segmentImageEndpoint",
    "source": "src/image/api.spore:8",
    "metadataStripped": true,
    "decoderSandbox": true,
    "unsafeNativeDecoder": false,
    "maxFileSize": "20mb",
    "maxDecodedMemory": "256mb",
    "externalProviderUsed": false
  }
}
```

---

# 36. Generated AI Guide Section

```markdown
## Image AI Package Summary

Flow:
`segmentImage`

Input:
`FileRef`

Output:
`ImageMask`

Package:
`ImageSegmentationPackage`

Model:
`SegmentationModel`

Compute:
`compute auto`

Preferred targets:
1. photonic_auto
2. AI accelerator
3. GPU
4. CPU

Selected target:
GPU

Reason:
Photonic target was unavailable. GPU was available and suitable.

Security:
- Image size limits are enabled.
- Metadata stripping is enabled.
- Decoder sandboxing is enabled.

AI note:
Keep image loading and request handling outside model-heavy compute flows. Use image packages for classification, detection, segmentation, embeddings and generation. Do not treat image AI tasks as native Galerina features.
```

---

# 37. Map Manifest Integration

```json
{
  "imagePackages": [
    {
      "package": "ImageSegmentationPackage",
      "flow": "segmentImage",
      "source": "src/image/segment.spore:4",
      "model": "SegmentationModel",
      "input": "FileRef",
      "output": "ImageMask",
      "effects": ["file.read", "compute.run"],
      "computeMode": "auto"
    },
    {
      "package": "ImageEmbeddingPackage",
      "flow": "createImageEmbedding",
      "source": "src/image/embed.spore:4",
      "input": "FileRef",
      "output": "ImageEmbedding",
      "effects": ["file.read", "compute.run"],
      "computeMode": "auto"
    }
  ]
}
```

---

# 38. Non-Goals

Image AI support should not:

```text
turn Galerina into an image editor
turn Galerina into an image processing engine
turn Galerina into a computer vision framework
turn Galerina into an OCR platform
turn Galerina into an image generation platform
turn Galerina into an image search engine
force every image task to use GPU
force every image task to use photonic compute
hide target fallback
hide image memory use
allow malformed images without validation
allow unsafe image decoders silently
perform file/API/database work inside model compute blocks
make beginner code expose Tensor<...> or Vector<...> details
hard-code one AI provider
hard-code one model family
hard-code one image codec implementation
```

---

# 39. Open Questions

```text
Should Image, ImageMask and DetectedObject be standard-library candidate types or package-defined?
Should image task names be standardised as package conventions?
Should image package effects be standardised?
Should image decoding be sandboxed by default?
Should image metadata be stripped by default?
Should photonic_auto be allowed by default for segmentation?
Should CPU reference verification be required for photonic targets?
Should batch image tasks have separate memory limits?
Should external vision packages be allowed in production?
Should image embeddings expose vector dimensions only in reports?
Should generated images be marked with metadata by default?
```

---

# 40. Recommended Early Version

## Version 0.1

```text
image package boundary examples
image_policy example
image validation example
classification package example
detection package example
segmentation package example
target report
```

## Version 0.2

```text
model binding examples
GPU target planning
CPU fallback
image memory reports
image security reports
AI guide image package summary
```

## Version 0.3

```text
photonic_auto planning for suitable model-heavy image layers
precision/tolerance reports
batch image processing
image embedding package examples
image similarity package examples
```

## Version 0.4

```text
external runtime interop examples
cloud AI accelerator profiles
wavelength/optical image preprocessing candidates
image generation package safety
generated image metadata rules
```

---

# 41. Refactoring Summary

This document replaces the earlier idea that image AI tasks should be native Galerina task types.

The revised position is:

```text
Image AI tasks are not native Galerina features.
Image AI is a package/provider/framework area.
Galerina provides safe primitives that image packages can use.
```

## What Was Removed

The following ideas should be removed from the older version of this document:

```text
Galerina should natively support image classification.
Galerina should natively support image detection.
Galerina should natively support image segmentation.
Galerina should natively support edge detection.
Galerina should natively support region detection.
Galerina should natively support pattern detection.
Galerina should natively support image feature extraction.
Galerina should natively support image embeddings.
Galerina should natively support image similarity.
Galerina should natively support image generation.
Galerina should natively define every image AI task type.
```

## What Was Kept

The following ideas remain valid, but should be described as general Galerina primitives and tooling:

```text
typed inputs
typed outputs
typed errors
binary data
file streams
Result<T, Error>
Option<T>
effects
permissions
network.outbound
network.inbound
file.read
file.write
compute.run
memory.large
SecureString
timeouts
rate limits
memory limits
structured errors
source maps
compiler reports
package reports
security reports
target reports
memory reports
runtime profiles
compute auto for suitable model-heavy stages
```

## What Was Moved to Packages

The following belong in packages:

```text
Image
ImageMask
MaskData
EdgeMap
ClassificationLabel
DetectedObject
BoundingBox
ConfidenceScore
SimilarityScore
ImageFeatures
ImageEmbedding
ImageDocument
ImageSearchResult
ImageClassification
ImageDetection
ImageSegmentation
EdgeDetection
RegionDetection
PatternDetection
FeatureExtraction
ImageSimilarity
ImagePreprocessing
ImageGeneration
ImageModeration
ImageSearch
```

## What Was Moved to Frameworks

The following belong in frameworks or applications:

```text
image upload forms
image galleries
image editors
image review screens
image moderation dashboards
visual search interfaces
image tagging workflows
media library workflows
admin screens
human review queues
business-specific image workflows
```

## What Was Moved to External Services

The following belong in external services or provider integrations:

```text
image classification APIs
object detection APIs
segmentation APIs
OCR APIs
image moderation APIs
visual search APIs
image embedding APIs
image generation APIs
model hosting
cloud storage
```

---

# 42. Final Principle

Galerina should make image AI safe to call and easy to report without becoming an image processing engine or computer vision framework.

Final rule:

```text
Use typed inputs.
Use typed outputs.
Use safe file and stream boundaries.
Use explicit effects.
Use package permissions.
Use image validation.
Use memory limits.
Use metadata stripping.
Use sandboxed decoders where possible.
Use compute auto for model-heavy stages.
Use CPU exact logic for loading, validation, safety and final decisions.
Always fallback safely.
Report target, precision, memory and security decisions clearly.
```

Image AI systems should be built on top of Galerina, not inside Galerina.
