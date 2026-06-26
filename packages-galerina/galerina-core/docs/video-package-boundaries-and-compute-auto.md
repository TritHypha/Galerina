# Galerina Video Package Boundaries and Compute Auto

Galerina, short for **Galerina**, is a strict, memory-safe, security-first programming language and compiler/toolchain.

Galerina source files use the `.spore` extension.

Example files:

```text
boot.spore
main.spore
video-provider-example.spore
video-policy.spore
video-worker-example.spore
browser-video-example.spore
```

---

## Summary

This document defines how Galerina should safely support **video packages, video providers and video AI workflows** without making video processing a native language feature.

Galerina should not become:

```text
a video editor
a video hosting platform
a streaming platform
a media player framework
a video CMS
a transcoding platform
a video AI platform
a provider-specific SDK
```

Galerina should provide safe primitives that video packages can use:

```text
typed inputs
typed outputs
binary data
file streams
network streams
byte streams
effects
permissions
safe secrets
timeouts
rate limits
memory limits
runtime profiles
compute auto
source maps
compiler reports
package reports
privacy reports
security reports
target reports
```

Video-specific systems should be implemented through:

```text
packages
drivers
frameworks
applications
external services
tooling
```

not through native Galerina language features.

---

## Classification

```text
Area: Video AI, video processing and video workflows
Native language feature: No
Supported through Galerina primitives: Yes
Belongs in: Packages, provider integrations, frameworks, tooling, external services
```

---

## Core Principle

Galerina should not say:

```text
Galerina natively supports video processing.
Galerina natively supports video classification.
Galerina natively supports video search.
Galerina natively supports video embeddings.
Galerina natively supports video transcription.
Galerina natively supports camera recording.
Galerina natively supports screen capture.
Galerina natively supports video moderation.
```

Galerina should say:

```text
Galerina supports safe typed boundaries that video packages can use.
```

The correct model is:

```text
Galerina core:
  safe language primitives

Galerina standard library:
  low-level utilities such as files, streams, binary data, time, errors and reports

Galerina packages:
  video codecs
  video processors
  video model clients
  video embedding clients
  video search clients
  video moderation clients
  frame extraction clients
  subtitle/transcript clients

Galerina frameworks:
  upload workflows
  media players
  video dashboards
  video review workflows
  moderation workflows
  CMS video workflows
  accessibility workflows

Applications:
  consent rules
  retention rules
  enabled providers
  privacy policy
  allowed formats
  business behaviour
  moderation policy

External services:
  video AI providers
  video search services
  video hosting services
  transcoding services
  storage providers
  media CDN providers
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
NetworkStream
Duration
DateTime
Text
Locale
LanguageCode
Result<T, Error>
Option<T>
effects
permissions
network.outbound
network.inbound
file.read
file.write
env.read
compute.run
memory.large
safe secrets
SecureString
timeouts
rate limits
memory limits
structured errors
source maps
compiler reports
package reports
security reports
privacy reports
runtime profiles
```

These primitives are useful for video packages, but they are not video features by themselves.

---

# 2. What Video Packages Provide

Video packages may define types such as:

```text
Video
VideoClip
VideoStream
VideoFrame
FrameRate
VideoFormat
VideoSegment
VideoEvent
VideoEmbedding
SubtitleTrack
Transcript
Thumbnail
VideoDocument
VideoSearchResult
VideoClassificationRequest
VideoClassificationResult
VideoTranscriptionRequest
VideoTranscriptionResult
VideoModerationResult
```

These should be package-defined or standard-library-candidate types, not required Galerina core language types.

---

# 3. What Video Packages May Implement

Video packages may implement:

```text
video classification
object detection in video
video segmentation
scene detection
motion detection
activity recognition
video summarisation
video-to-text description
speech extraction
subtitle generation
transcript generation
video search
video embeddings
video similarity search
thumbnail generation
frame extraction
audio extraction
video moderation
stream analysis
video decoding
video encoding
video format conversion
```

Galerina should provide the safety model around these capabilities.

The specialist implementation belongs in packages or external services.

---

# 4. What Frameworks Provide

Frameworks may provide:

```text
video upload UI
video player UI
timeline UI
moderation dashboards
transcription review screens
subtitle editing screens
video CMS workflows
streaming dashboards
recording workflows
camera capture UI
screen capture UI
accessibility workflows
```

These should not be native Galerina features.

---

# 5. What Applications Decide

Applications should decide:

```text
whether camera access is allowed
whether screen capture is allowed
whether recording is allowed
whether raw video can be stored
how long video may be retained
which formats are accepted
which resolutions are accepted
which video provider is used
which transcription provider is used
which moderation provider is used
whether face detection is allowed
whether person tracking is allowed
whether transcripts require redaction
which users may access video files
which video jobs should be queued
```

Galerina should not hard-code these decisions.

---

# 6. What External Services Provide

External services may provide:

```text
video hosting
video transcoding
video streaming
video AI inference
video moderation
object detection APIs
video embedding APIs
video search services
speech-to-text APIs
subtitle generation APIs
cloud storage
media CDN delivery
AI model hosting
```

Galerina packages may integrate with these systems.

Galerina core should not hard-code provider-specific behaviour.

---

# 7. Video Types as Package Types

A video package may define types like this:

```Galerina
type Video
type VideoClip
type VideoStream
type VideoFrame
type FrameRate
type VideoFormat
type VideoSegment
type VideoEvent
type VideoEmbedding
type SubtitleTrack
type Transcript
type Thumbnail
type VideoDocument
```

These are useful package-level abstractions.

They should not imply that Galerina core contains a native video engine.

## Example Type Meanings

| Type | Purpose |
|---|---|
| `Video` | Generic video value provided by a video package |
| `VideoClip` | Finite video file or clip |
| `VideoStream` | Streaming video input/output |
| `VideoFrame` | Individual frame extracted from video |
| `FrameRate` | Frame rate metadata |
| `VideoFormat` | Format metadata such as mp4, webm or mov |
| `VideoSegment` | Time-bounded section of video |
| `VideoEvent` | Detected event, object, action or scene |
| `VideoEmbedding` | Vector-like representation for search or similarity |
| `SubtitleTrack` | Timed subtitle/caption data |
| `Transcript` | Text transcript from video audio |
| `Thumbnail` | Preview image generated from video |
| `VideoDocument` | Searchable or stored video record |

---

# 8. Video Policy

Video policy should be project or package configuration.

It should not be native language syntax.

Example project policy:

```Galerina
video_policy {
  max_duration 30m
  max_file_size 2gb
  max_decoded_memory 4gb
  max_resolution "4k"

  allowed_formats [
    "mp4",
    "webm",
    "mov"
  ]

  frame_extraction {
    max_frames_per_second 2
    max_total_frames 10000
  }

  streaming {
    max_stream_duration 2h
    chunk_size 8mb
    backpressure true
  }

  privacy {
    require_user_consent true
    face_detection "requires_permission"
    person_tracking "requires_permission"
    store_raw_video "deny_by_default"
    strip_metadata true
    transcript_redaction true
    retention 30d
  }

  reports {
    video_report true
    privacy_report true
    memory_report true
    target_report true
  }
}
```

Galerina may support configuration validation, reports, effects and permission checks.

The video package decides how the policy is applied.

---

# 9. Video Effects

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

Video packages or browser/runtime packages may define package-level effects such as:

```text
video.decode
video.encode
video.stream
video.extract_audio
video.extract_frames
video.play
video.record
camera.read
screen.capture
media.play
media.record
face.detect
person.track
```

These should not be required Galerina core effects.

They are useful package-defined or runtime-defined permissions.

---

# 10. Video Classification Example

Video classification is not a native Galerina feature.

It belongs in a video package or external provider.

Example package-level flow:

```Galerina
secure flow classifyVideo(videoFile: FileRef) -> Result<ClassificationLabel, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return VideoClassifierPackage.classify {
    video videoBytes
    max_duration 30m
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
VideoError
video decoding
classification model
classification output
```

---

# 11. Object Detection in Video

Object detection belongs in packages.

Example package-level flow:

```Galerina
secure flow detectVideoObjects(videoFile: FileRef) -> Result<Array<VideoEvent>, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return VideoDetectionPackage.detect {
    video videoBytes
  }?
}
```

Package-defined event type:

```Galerina
type VideoEvent {
  label: String
  start: Duration
  end: Duration
  confidence: Float
  frameRange: Option<FrameRange>
  box: Option<BoundingBox>
}
```

Galerina should not define the detection model, label set or bounding-box logic as native language features.

---

# 12. Video Segmentation

Video segmentation belongs in packages.

Example:

```Galerina
secure flow segmentVideo(videoFile: FileRef) -> Result<Array<VideoSegment>, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return VideoSegmentationPackage.segment {
    video videoBytes
  }?
}
```

Package-defined segment type:

```Galerina
type VideoSegment {
  start: Duration
  end: Duration
  label: String
  confidence: Float
}
```

---

# 13. Scene Detection and Motion Detection

Scene detection and motion detection belong in packages.

Example:

```Galerina
secure flow detectScenes(videoFile: FileRef) -> Result<Array<VideoSegment>, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return SceneDetectionPackage.detect {
    video videoBytes
  }?
}
```

Example motion detection:

```Galerina
secure flow detectMotion(videoFile: FileRef) -> Result<Array<VideoEvent>, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return MotionDetectionPackage.detect {
    video videoBytes
  }?
}
```

Galerina should make memory, target and permission behaviour visible.

The package should implement the specialist video logic.

---

# 14. Activity Recognition

Activity recognition belongs in video AI packages.

Example:

```Galerina
secure flow recogniseActivities(videoFile: FileRef) -> Result<Array<VideoEvent>, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return ActivityRecognitionPackage.recognise {
    video videoBytes
  }?
}
```

Examples of activities:

```text
person walking
vehicle stopping
machine operating
worker lifting
object falling
gesture detected
```

The recognised activities should map to typed values before they drive application behaviour.

---

# 15. Video Transcription

Video transcription is a workflow, not a native Galerina feature.

It may involve:

```text
video package
audio extraction package
speech-to-text package
subtitle package
provider APIs
```

Example package-level flow:

```Galerina
secure flow transcribeVideo(videoFile: FileRef) -> Result<Transcript, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  let audio = VideoAudioPackage.extractAudio {
    video videoBytes
  }?

  return SpeechToTextPackage.transcribe {
    audio audio
  }?
}
```

Galerina should report the stages.

Galerina should not make video transcription a built-in language task.

---

# 16. Subtitle Generation

Subtitle generation belongs in packages.

Example:

```Galerina
secure flow generateSubtitles(
  videoFile: FileRef,
  language: LanguageCode
) -> Result<SubtitleTrack, VideoError>
effects [file.read, compute.run] {
  let transcript = transcribeVideo(videoFile)?

  return SubtitlePackage.fromTranscript {
    transcript transcript
    language language
  }?
}
```

Package-defined types:

```Galerina
type SubtitleTrack {
  language: LanguageCode
  segments: Array<SubtitleSegment>
}

type SubtitleSegment {
  start: Duration
  end: Duration
  text: Text
}
```

Galerina provides typed boundaries and reports.

The package provides subtitle-specific logic.

---

# 17. Video Summarisation

Video summarisation belongs in packages.

It may combine:

```text
visual frames
audio transcript
detected scenes
detected objects
detected events
```

Example:

```Galerina
secure flow summariseVideo(videoFile: FileRef) -> Result<TextSummary, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  let transcript = SpeechToTextPackage.transcribeVideoAudio {
    video videoBytes
  }?

  let keyFrames = FramePackage.extractKeyFrames {
    video videoBytes
  }?

  let scenes = SceneDetectionPackage.detect {
    video videoBytes
  }?

  return VideoSummaryPackage.summarise {
    video videoBytes
    transcript transcript
    keyFrames keyFrames
    scenes scenes
  }?
}
```

Galerina should not provide the summarisation model natively.

---

# 18. Video-to-Text Description

Video-to-text description belongs in video AI packages.

Example:

```Galerina
secure flow describeVideo(videoFile: FileRef) -> Result<TextSummary, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return VideoDescriptionPackage.describe {
    video videoBytes
  }?
}
```

The package handles model behaviour.

Galerina handles safety, typing, effects and reports.

---

# 19. Thumbnail Generation

Thumbnail generation belongs in packages.

Example:

```Galerina
secure flow createThumbnail(videoFile: FileRef) -> Result<Thumbnail, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return ThumbnailPackage.create {
    video videoBytes
    at 5s
  }?
}
```

Galerina should not natively implement thumbnail generation.

---

# 20. Frame Extraction

Frame extraction belongs in packages.

Example:

```Galerina
secure flow extractKeyFrames(videoFile: FileRef) -> Result<Array<VideoFrame>, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return FrameExtractionPackage.extractKeyFrames {
    video videoBytes
  }?
}
```

Frame extraction should obey project or package policy such as:

```text
max frames per second
max total frames
max decoded memory
allowed formats
```

---

# 21. Audio Extraction

Audio extraction belongs in packages.

Example:

```Galerina
secure flow extractAudioFromVideo(videoFile: FileRef) -> Result<AudioClip, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return VideoAudioPackage.extractAudio {
    video videoBytes
  }?
}
```

Galerina should not natively implement video demuxing or codec logic.

---

# 22. Video Moderation

Video moderation belongs in packages or external services.

Example:

```Galerina
secure flow moderateVideo(videoFile: FileRef) -> Result<ModerationResult, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return VideoModerationPackage.moderate {
    video videoBytes
  }?
}
```

Recommended result shape:

```Galerina
type ModerationResult {
  allowed: Bool
  decision: Decision
  categories: Array<String>
  confidence: Float
}
```

Important rule:

```text
Uncertain moderation should return Review, not Allow.
```

Galerina should support typed decisions and audit reports.

It should not provide a native moderation engine.

---

# 23. Video Embeddings

Video embeddings are package-defined.

Example:

```Galerina
secure flow createVideoEmbedding(videoFile: FileRef) -> Result<VideoEmbedding, VideoError>
effects [file.read, compute.run] {
  let videoBytes = file.readBytes(videoFile)?

  return VideoEmbeddingPackage.encode {
    video videoBytes
  }?
}
```

Galerina should not natively define embedding dimensions, model compatibility or vector formats.

Packages should report them.

---

# 24. Video Search

Video search is not a native Galerina feature.

It combines video packages and search/vector packages.

Example:

```Galerina
secure flow searchSimilarVideos(videoFile: FileRef) -> Result<SearchResults<VideoDocument>, SearchError>
effects [file.read, compute.run, network.outbound] {
  let videoBytes = file.readBytes(videoFile)?
  let embedding = VideoEmbeddingPackage.encode { video videoBytes }?

  return VideoSearchProvider.search<VideoDocument> {
    embedding embedding
    top_k 20
    metric "cosine"
  }?
}
```

The packages provide:

```text
VideoEmbeddingPackage
VideoSearchProvider
SearchResults<T>
SearchError
VideoDocument
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

# 25. Text-to-Video Search

Text-to-video search belongs in packages.

Example:

```Galerina
secure flow searchVideosByText(query: Text) -> Result<SearchResults<VideoDocument>, SearchError>
effects [compute.run, network.outbound] {
  let embedding = TextEmbeddingPackage.encode {
    text query
  }?

  return VideoSearchProvider.search<VideoDocument> {
    embedding embedding
    top_k 20
    metric "cosine"
  }?
}
```

Galerina should not natively define:

```text
TextEmbedding
VideoSearchProvider
video vector search
natural language video search
```

Those are package/provider areas.

---

# 26. Video Input Validation

Video packages should validate:

```text
video format
file size
duration
resolution
frame rate
decoded memory size
metadata policy
malformed video data
audio track presence
subtitle track presence
unsafe codec behaviour
```

Example policy:

```Galerina
video_policy {
  validation {
    max_duration 30m
    max_file_size 2gb
    max_decoded_memory 4gb
    max_resolution "4k"
    metadata "strip"
  }
}
```

Example error:

```text
Video validation error:
Video exceeds max duration.

Max:
  30m

Received:
  2h14m
```

Galerina should support structured errors and reports.

The video package performs the video-specific validation.

---

# 27. Browser and Device Video

Browser and device video should be handled through runtime profiles and packages.

Example recording flow:

```Galerina
secure flow recordVideoClip() -> Result<VideoClip, BrowserError>
effects [camera.read, media.record] {
  return BrowserVideo.record(max_duration: 60s)?
}
```

Example playback flow:

```Galerina
secure flow playVideo(video: VideoClip) -> Result<Void, BrowserError>
effects [media.play] {
  BrowserVideo.play(video)?
  return Ok()
}
```

Example screen capture flow:

```Galerina
secure flow captureScreen() -> Result<VideoStream, BrowserError>
effects [screen.capture] {
  return BrowserScreen.capture()?
}
```

Galerina should not natively implement browser video APIs.

Browser video belongs in runtime packages and browser interop.

---

# 28. Browser Video Permissions

Camera, screen capture and recording should be denied by default.

Example project policy:

```Galerina
browser {
  permissions {
    camera "deny_by_default"
    screen_capture "deny_by_default"
    media_record "deny_by_default"
    media_play "allow"
  }
}
```

Example project enabling camera:

```Galerina
browser {
  permissions {
    camera "allow_with_user_permission"
    media_record "allow_with_user_permission"
  }
}
```

Rules:

```text
camera access requires explicit permission
screen capture requires explicit permission
recording requires explicit permission
face detection requires explicit policy
person tracking requires explicit policy
raw video storage requires explicit policy
```

---

# 29. Video Security and Privacy

Video can contain:

```text
faces
people
locations
voices
private spaces
documents
screens
biometric information
personal data
confidential business information
medical information
legal information
financial information
```

Galerina should support primitives and reports that help packages enforce:

```text
user consent policies
camera permission checks
screen capture permission checks
face/person detection restrictions
raw video storage controls
metadata stripping
transcript redaction
PII detection in transcripts
secret detection in transcripts
retention policies
safe logging
audit reports
```

Example policy:

```Galerina
video_policy {
  privacy {
    require_user_consent true
    store_raw_video "deny_by_default"
    face_detection "requires_permission"
    person_tracking "requires_permission"
    strip_metadata true
    transcript_redaction true
    pii_detection true
    secret_detection true
    retention 30d
  }
}
```

---

# 30. Video Streaming

Video streaming should use Galerina's general streaming primitives.

Video-specific streaming belongs in packages.

Example:

```Galerina
secure flow analyseVideoStream(stream: ByteStream) -> Result<Array<VideoEvent>, VideoError>
effects [video.stream, compute.run] {
  return StreamingVideoPackage.analyse(stream)?
}
```

Streaming packages should support:

```text
chunked processing
backpressure
timeouts
memory limits
partial events
final results
connection loss handling
cancellation
```

Galerina provides the general stream safety model.

---

# 31. Where `compute auto` Fits

`compute auto` is a general Galerina compute feature.

It is not video-specific.

Video packages may use `compute auto` for model-heavy or numeric work.

Good candidates:

```text
video classification
object detection
video segmentation
scene detection
motion detection
activity recognition
video embeddings
video similarity search
video summarisation
video moderation
thumbnail/key-frame selection
```

Poor candidates:

```text
permission prompts
file loading
privacy checks
database writes
API routing
final business decisions
exact security decisions
secret redaction
camera permission checks
screen capture permission checks
```

Recommended split:

```text
video loading / permission / validation:
  CPU exact logic

video frame/audio/model work:
  compute auto

final decision / storage / response:
  CPU exact logic
```

---

# 32. Compute Targets for Video Packages

Video AI packages may target:

```text
CPU
CPU vector
GPU
AI accelerator
NPU
photonic candidate planning where suitable
```

Example package model declaration:

```Galerina
model VideoClassifier {
  input Video
  output ClassificationLabel

  targets {
    prefer [ai_accelerator, gpu, cpu]
    fallback true
  }

  precision {
    input Float16
    compute Float16
    accumulate Float32
    output Float32
  }
}
```

Photonic or accelerator targets may be considered for suitable matrix-heavy model layers.

They should not be used for:

```text
camera access
screen capture
permission checks
video file loading
video file decoding
privacy checks
final business decisions
```

---

# 33. Photonic Support for Video Packages

Photonic support should be considered only for suitable internal model stages.

Good photonic candidates:

```text
matrix-heavy model layers
embedding transforms
dense layers
feature extraction stages
some classification model internals
some segmentation model internals
some summarisation model internals
```

Poor photonic candidates:

```text
video decoding
camera permissions
screen capture
file loading
database writes
final decisions
privacy checks
metadata stripping
raw storage decisions
```

Recommended split:

```text
video decode:
  CPU / GPU / media hardware

frame extraction:
  CPU / GPU

model inference:
  GPU / AI accelerator / possible future photonic

final typed result:
  CPU
```

---

# 34. API Example: Video Classification

Example API endpoint using a video package:

```Galerina
api VideoApi {
  POST "/video/classify" {
    request VideoClassificationRequest
    response VideoClassificationResponse
    timeout 120s
    max_body_size 2gb
    handler classifyVideoEndpoint
  }
}
```

Handler:

```Galerina
secure flow classifyVideoEndpoint(req: Request) -> Result<Response, ApiError>
effects [network.inbound, file.read, compute.run] {
  let input: VideoClassificationRequest = json.decode<VideoClassificationRequest>(&req.body)?

  let label: ClassificationLabel = VideoClassifierPackage.classify {
    file input.file
    max_duration 30m
  }?

  return JsonResponse(VideoClassificationResponse {
    label label
  })
}
```

The API is application/framework code.

The classification capability is package code.

Galerina provides safe typed boundaries.

---

# 35. API Example: Video Transcription

```Galerina
api VideoApi {
  POST "/video/transcribe" {
    request VideoTranscriptionRequest
    response VideoTranscriptionResponse
    timeout 120s
    max_body_size 2gb
    handler transcribeVideoEndpoint
  }
}
```

Handler:

```Galerina
secure flow transcribeVideoEndpoint(req: Request) -> Result<Response, ApiError>
effects [network.inbound, file.read, compute.run] {
  let input: VideoTranscriptionRequest = json.decode<VideoTranscriptionRequest>(&req.body)?

  let transcript: Transcript = VideoTranscriptionPackage.transcribe {
    file input.file
    max_duration 30m
  }?

  return JsonResponse(VideoTranscriptionResponse {
    transcript transcript
  })
}
```

The transcription package may internally use audio extraction and speech-to-text.

Galerina should report these stages.

---

# 36. Batch Video Processing

Long video processing should usually run through workers or queues.

Queues are not native Galerina platforms.

Galerina may support worker profiles and typed job boundaries.

Example:

```Galerina
job ProcessVideoFile {
  input videoId: VideoId

  queue "video_jobs"

  limits {
    timeout 30m
    max_memory 8gb
    max_retries 3
  }

  handler processVideoFile
}
```

Handler:

```Galerina
secure flow processVideoFile(input: ProcessVideoFile) -> Result<Void, VideoError>
effects [file.read, database.write, compute.run, network.outbound] {
  let videoFile: FileRef = videoStore.find(input.videoId)?

  let transcript: Transcript = VideoTranscriptionPackage.transcribe {
    file videoFile
  }?

  let summary: TextSummary = VideoSummaryPackage.summarise {
    file videoFile
  }?

  let embedding: VideoEmbedding = VideoEmbeddingPackage.encode {
    file videoFile
  }?

  db.videoMetadata.insert({
    videoId input.videoId
    transcript transcript
    summary summary
  })?

  VideoSearchProvider.upsert {
    id input.videoId
    embedding embedding
  }?

  return Ok()
}
```

---

# 37. Rate Limits and Queues

Video tasks can be expensive.

Example policy:

```Galerina
effect_limits {
  video.decode {
    max_per_minute 30
    max_concurrent 3
  }

  video.encode {
    max_per_minute 20
    max_concurrent 2
  }

  video.stream {
    max_concurrent 10
  }

  camera.read {
    max_concurrent 1
  }

  compute.run {
    max_concurrent 4
  }
}
```

Queue example:

```Galerina
queue video_jobs {
  retry {
    max_attempts 3
    backoff "exponential"

    retry_on [
      Timeout,
      ConnectionFailed,
      RateLimited
    ]

    never_retry_on [
      PermissionDenied,
      InvalidVideo,
      PrivacyDenied
    ]
  }

  dead_letter_queue "video_jobs_failed"
}
```

This is application/framework/tooling configuration, not a native queue platform.

---

# 38. Package Support

Video models, codecs and processors should come from packages.

Example:

```Galerina
packages {
  use VideoModels from vendor "./vendor/video-models" {
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
use VideoModels
```

Package rules:

```text
video packages should not get shell access by default
video packages should not get network access unless required
native codec bindings should be audited
large memory usage should be reported
unsafe decoding should be sandboxed where possible
unsafe features should be visible in package reports
```

---

# 39. External Runtime Interop Option

Some video tooling may initially depend on external runtimes.

Example:

```Galerina
packages {
  use VideoRuntime from external_runtime "video-tools" {
    version "4.0.0"

    permissions {
      file_read "allow"
      file_write "deny"
      network "deny"
      environment "deny"
      shell "deny"
    }

    runtime {
      mode "isolated"
      timeout 300s
      memory_limit 8gb
    }
  }
}
```

This should be treated as interop, not native Galerina video support.

External video packages require sandboxing, permission reports and runtime limits.

---

# 40. Generated Video Package Report

Galerina should support reports that make video package behaviour visible.

Example:

```json
{
  "videoPackageReport": {
    "package": "VideoClassifierPackage",
    "flow": "classifyVideo",
    "source": "src/video/classify.spore:4",
    "input": {
      "type": "FileRef",
      "declaredMaxDuration": "30m",
      "declaredMaxFileSize": "2gb",
      "declaredMaxResolution": "4k"
    },
    "output": {
      "type": "ClassificationLabel"
    },
    "effects": ["file.read", "compute.run"],
    "packageEffects": ["video.decode", "video.analyse"],
    "computeMode": "auto",
    "selectedTarget": "gpu",
    "fallbacks": ["cpu_vector", "cpu"]
  }
}
```

---

# 41. Generated Privacy Report

```json
{
  "videoPrivacyReport": {
    "flow": "processVideoFile",
    "source": "src/video/jobs.spore:12",
    "rawVideoStored": false,
    "metadataStripped": true,
    "faceDetection": false,
    "personTracking": false,
    "transcriptRedaction": true,
    "userConsentRequired": true,
    "retention": "30d"
  }
}
```

---

# 42. Generated Memory Report

```json
{
  "videoMemoryReport": {
    "flow": "classifyVideo",
    "input": {
      "declaredMaxDuration": "30m",
      "declaredMaxResolution": "4k",
      "decodedMemoryLimit": "4gb"
    },
    "selectedTarget": "gpu",
    "estimatedDeviceMemory": "2.8gb",
    "withinLimit": true
  }
}
```

---

# 43. Generated Target Report

```json
{
  "videoTargetReport": {
    "flow": "summariseVideo",
    "source": "src/video/summary.spore:4",
    "stages": [
      {
        "stage": "video_decode",
        "selectedTarget": "cpu"
      },
      {
        "stage": "audio_extraction",
        "selectedTarget": "cpu"
      },
      {
        "stage": "speech_to_text",
        "selectedTarget": "gpu",
        "fallbacks": ["cpu"]
      },
      {
        "stage": "key_frame_extraction",
        "selectedTarget": "gpu",
        "fallbacks": ["cpu_vector", "cpu"]
      },
      {
        "stage": "summary_model",
        "selectedTarget": "ai_accelerator",
        "fallbacks": ["gpu", "cpu"]
      }
    ]
  }
}
```

---

# 44. Generated AI Guide Section

```markdown
## Video Package Summary

Flow:
`classifyVideo`

Input:
`FileRef`

Output:
`ClassificationLabel`

Package:
`VideoClassifierPackage`

Compute:
`compute auto`

Selected target:
GPU

Privacy:
- User consent required.
- Raw video storage denied by default.
- Metadata stripping enabled.
- Face/person detection requires explicit permission.
- Transcript redaction enabled where transcript generation is used.

AI note:
Keep camera access, screen capture, file loading, validation and permission checks outside model-heavy compute flows. Use video packages for classification, transcription, moderation and search. Do not treat video processing as a native Galerina feature.
```

---

# 45. Map Manifest Integration

```json
{
  "videoPackages": [
    {
      "package": "VideoClassifierPackage",
      "flow": "classifyVideo",
      "source": "src/video/classify.spore:4",
      "input": "FileRef",
      "output": "ClassificationLabel",
      "effects": ["file.read", "compute.run"],
      "computeMode": "auto"
    },
    {
      "package": "VideoEmbeddingPackage",
      "flow": "createVideoEmbedding",
      "source": "src/video/embed.spore:4",
      "input": "FileRef",
      "output": "VideoEmbedding",
      "effects": ["file.read", "compute.run"],
      "computeMode": "auto"
    },
    {
      "package": "VideoTranscriptionPackage",
      "flow": "transcribeVideo",
      "source": "src/video/transcribe.spore:4",
      "input": "FileRef",
      "output": "Transcript",
      "effects": ["file.read", "compute.run"],
      "computeMode": "auto"
    }
  ]
}
```

---

# 46. Security Rules

Galerina should support rules and reports that help video packages enforce:

```text
camera access denied by default
screen capture denied by default
video recording denied by default
face detection requires explicit permission
person tracking requires explicit permission
raw video storage denied by default unless configured
video metadata should be stripped where configured
transcripts should support PII and secret redaction
large video files require limits
long video should stream or queue
video packages require explicit permissions
native video codecs require audit if unsafe
unsafe decoding should be sandboxed where possible
model output should map to typed values
video moderation uncertainty should return Review, not Allow
external providers require network permission
video package memory usage should be reported
```

---

# 47. Non-Goals

Video support should not:

```text
turn Galerina into a video editing framework
turn Galerina into a video hosting platform
turn Galerina into a streaming platform
turn Galerina into a media player framework
turn Galerina into a transcoding platform
hard-code a video codec provider
hard-code a video AI provider
hard-code a video search provider
allow camera access silently
allow screen capture silently
store raw video silently
identify faces without policy permission
track people without policy permission
hide memory use
hide compute target fallback
execute generated actions from video analysis without typed validation
```

---

# 48. Open Questions

```text
Should Video be a standard-library candidate type or always package-defined?
Should Transcript be shared with audio packages?
Should video package effects be standardised?
Should video.extractAudio-style APIs be package conventions only?
Should camera.read always require browser/user permission?
Should raw video storage be denied by default in production?
Should face detection/person tracking require special privacy effects?
Should video streams have mandatory max duration?
Should video transcription always produce a privacy report?
Should external video packages be allowed in production?
Should video embeddings expose dimensions only in reports?
Should video jobs always be queued above a duration/file-size threshold?
Should native codec bindings require a higher audit level?
```

---

# 49. Recommended Early Version

## Version 0.1

```text
video package boundary examples
FileRef and stream examples
video classification package example
video transcription package example
video policy example
video validation example
basic video reports
```

## Version 0.2

```text
video package effects
video privacy reports
video memory reports
scene detection package example
frame extraction package example
thumbnail package example
video embedding package example
```

## Version 0.3

```text
streaming video package examples
object detection package example
segmentation package example
activity recognition package example
queue support examples for long video jobs
browser camera/screen runtime package example
```

## Version 0.4

```text
video summarisation workflow example
video moderation package example
text-to-video search example
external runtime interop examples
target reports for video packages
photonic candidate planning for suitable model-heavy video layers
```

---

# 50. Refactoring Summary

This document replaces the earlier idea that video should be a native Galerina media type and AI task area.

The revised position is:

```text
Video processing is not a native Galerina feature.
Video processing is a package/provider/framework area.
Galerina provides safe primitives that video packages can use.
```

## What Was Removed

The following ideas should be removed from the older version of this document:

```text
Galerina should natively support video as a first-class media type.
Galerina should natively support video classification.
Galerina should natively support object detection in video.
Galerina should natively support video segmentation.
Galerina should natively support scene detection.
Galerina should natively support motion detection.
Galerina should natively support activity recognition.
Galerina should natively support video summarisation.
Galerina should natively support video-to-text description.
Galerina should natively support video transcription.
Galerina should natively support subtitle generation.
Galerina should natively support video embeddings.
Galerina should natively support video similarity search.
Galerina should natively support thumbnail generation.
Galerina should natively support frame extraction.
Galerina should natively support audio extraction.
Galerina should natively support video moderation.
Galerina should natively support stream analysis.
Galerina should natively define Video.
Galerina should natively define VideoClip.
Galerina should natively define VideoStream.
Galerina should natively define VideoFrame.
Galerina should natively define VideoEmbedding.
Galerina should natively define video AI task types.
```

## What Was Kept

The following ideas remain valid, but should be described as general Galerina primitives:

```text
typed inputs
typed outputs
binary data
file streams
network streams
byte streams
Duration
Text
Locale
LanguageCode
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
safe secrets
SecureString
timeouts
rate limits
memory limits
structured errors
source maps
compiler reports
package reports
security reports
privacy reports
target reports
runtime profiles
```

## What Was Moved to Packages

The following belong in packages:

```text
Video
VideoClip
VideoStream
VideoFrame
FrameRate
VideoFormat
VideoSegment
VideoEvent
VideoEmbedding
SubtitleTrack
Transcript
Thumbnail
VideoDocument
VideoClassification
VideoObjectDetection
VideoSegmentation
SceneDetection
MotionDetection
ActivityRecognition
VideoSummarisation
VideoDescription
VideoTranscription
SubtitleGeneration
ThumbnailGeneration
FrameExtraction
AudioExtraction
VideoModeration
VideoSearch
TextToVideoSearch
```

## What Was Moved to Frameworks

The following belong in frameworks or applications:

```text
video upload UI
video player UI
timeline UI
moderation dashboards
transcription review screens
subtitle editing screens
video CMS workflows
streaming dashboards
recording workflows
camera capture UI
screen capture UI
accessibility workflows
```

## What Was Moved to External Services

The following belong in external services or provider integrations:

```text
video hosting
video transcoding
video streaming
video AI inference
video moderation
object detection APIs
video embedding APIs
video search services
speech-to-text APIs
subtitle generation APIs
cloud storage
media CDN delivery
AI model hosting
```

---

# 51. Final Principle

Galerina should support video safely without becoming a video engine, video editor, streaming platform, hosting platform, video CMS, transcoding platform, media application, or provider SDK.

Final rule:

```text
Use typed inputs.
Use typed outputs.
Use safe file and stream boundaries.
Use explicit effects.
Use package permissions.
Use redaction rules.
Use consent policies.
Use rate limits.
Use timeouts.
Use memory limits.
Use reports.

Do not make video processing native syntax.
Do not make video classification a native task.
Do not make video search a native task.
Do not make video embeddings native.
Do not silently access the camera.
Do not silently capture screens.
Do not silently record video.
Do not silently store raw video.
Do not identify faces without policy permission.
Do not track people without policy permission.
Do not execute generated actions from video analysis without typed validation.
Do not hard-code video providers.
Do not hard-code video codecs.
```

Video systems should be built on top of Galerina, not inside Galerina.
