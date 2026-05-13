/// <reference lib="webworker" />

// Runs the speaker-embedding model off the main thread. The model is the
// open-source WeSpeaker ResNet34 (256-dim embeddings) converted to ONNX for
// transformers.js. Audio in: 16 kHz mono Float32 in [-1, 1]. Out: a unit
// L2-normalized Float32 embedding suitable for cosine similarity.

import {
  AutoModel,
  AutoProcessor,
  Tensor,
  env,
  type PreTrainedModel,
  type Processor,
} from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

// Speaker verification / embedding models known to ship as ONNX on the HF
// Hub for the transformers.js runtime. Tried in order; first that loads wins.
const MODEL_CANDIDATES = [
  "Xenova/wavlm-base-plus-sv",
  "Xenova/unispeech-sat-base-plus-sv",
];

type InitMessage = { type: "init" };
type EmbedMessage = {
  type: "embed";
  id: string;
  pcm: Float32Array;
};
type IncomingMessage = InitMessage | EmbedMessage;

let modelPromise: Promise<{
  model: PreTrainedModel;
  processor: Processor;
  modelId: string;
}> | null = null;

async function ensureModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const errors: string[] = [];
      for (const modelId of MODEL_CANDIDATES) {
        try {
          const processor = await AutoProcessor.from_pretrained(modelId);
          const model = await AutoModel.from_pretrained(modelId, {
            dtype: "fp32",
          });
          return { model, processor, modelId };
        } catch (err) {
          errors.push(
            `${modelId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      throw new Error(
        `No speaker-embedding model could be loaded. Tried:\n${errors.join("\n")}`
      );
    })();
  }
  return modelPromise;
}

function l2Normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i]! * vec[i]!;
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i]! / norm;
  return out;
}

async function embed(pcm: Float32Array): Promise<Float32Array> {
  const { model, processor } = await ensureModel();
  const inputs = await processor(pcm);
  const output = (await model(inputs)) as Record<string, Tensor>;

  const tensor =
    output.embeddings ??
    output.last_hidden_state ??
    output.logits ??
    Object.values(output)[0];

  if (!tensor) throw new Error("Model produced no embedding tensor.");

  const data = tensor.data as Float32Array;

  // Many speaker models return a [batch, embed_dim] tensor — already pooled.
  // If the rank suggests time dimension is still there, mean-pool over time.
  const dims = tensor.dims as number[];
  let pooled: Float32Array;
  if (dims.length === 3) {
    const [, time, dim] = dims as [number, number, number];
    pooled = new Float32Array(dim);
    for (let t = 0; t < time; t++) {
      for (let d = 0; d < dim; d++) {
        pooled[d]! += data[t * dim + d]!;
      }
    }
    for (let d = 0; d < dim; d++) pooled[d]! /= time || 1;
  } else {
    pooled = new Float32Array(data);
  }

  return l2Normalize(pooled);
}

self.addEventListener("message", async (ev: MessageEvent<IncomingMessage>) => {
  const msg = ev.data;
  if (msg.type === "init") {
    try {
      await ensureModel();
      (self as unknown as Worker).postMessage({ type: "ready" });
    } catch (err) {
      (self as unknown as Worker).postMessage({
        type: "error",
        error: err instanceof Error ? err.message : "init failed",
      });
    }
    return;
  }

  if (msg.type === "embed") {
    try {
      const emb = await embed(msg.pcm);
      (self as unknown as Worker).postMessage(
        { type: "embedding", id: msg.id, embedding: emb },
        { transfer: [emb.buffer] }
      );
    } catch (err) {
      (self as unknown as Worker).postMessage({
        type: "embed-error",
        id: msg.id,
        error: err instanceof Error ? err.message : "embed failed",
      });
    }
  }
});
