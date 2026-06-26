// precision-types.ts — the precision/scheduling/op-class vocabulary shared by the
// Brain (router) and the Brawn (bridges). These are the canonical TYPES; the
// routing LOGIC (sensitivity tables, routePrecision) stays in the Tower.

/** Number format a routed operation runs in (the COMPUTE-format / routing axis). */
export type PrecisionTechnique =
  | "ternary"    // BitNet b1.58 {-1,0,+1}
  | "fp4_block"  // NVFP4: 16×E2M1 (4-bit) + 1-byte E4M3 per-block scale = 9 B/block; LOSSY; NOT ternary
                 // (E2M1 has 8 magnitudes {0,½,1,1½,2,3,4,6}) — verified facts from the .tmf R&D
  | "fp8"        // intermediate fallback
  | "fp16";      // full precision (sensitivity-critical layers)

/**
 * How a bridge's weights were QUANTIZED — the STORAGE/method axis, distinct from the
 * compute-format `PrecisionTechnique` the router selects. Lets a bridge HONESTLY declare
 * the production quantization it ships, so the manifest can govern non-BitNet quantized
 * backends (a noisy lane can forbid a method; a certified profile can require qat/none).
 * Kept a CLOSED governance vocabulary, not a config dump. (idea-mining #5; MiniCPM/BitCPM
 * spectrum — see docs/Knowledge-Bases/galerina-external-idea-mining-2026-06-15.md.)
 */
export type QuantizationMethod =
  | "none"    // not quantized (full precision)
  | "qat"     // quantization-aware training (BitNet/BitCPM ternary, int4-QAT)
  | "gptq"    // post-training, AutoGPTQ
  | "awq"     // activation-aware weight quantization
  | "marlin"  // Marlin int4 kernels
  | "nf4"     // bitsandbytes NF4 (double-quant)
  | "gguf";   // llama.cpp GGUF k-quant

/** How execution is ordered in time. */
export type SchedulingTechnique =
  | "dynamic"               // standard runtime dispatch
  | "deterministic_static"; // Groq-style pre-scheduled, zero jitter

/** Which part of an inference pass an operation belongs to. */
export type InferenceOpClass =
  | "embedding"
  | "attention"
  | "feedforward"
  | "normalization"
  | "output_head"
  | "kv_cache";
