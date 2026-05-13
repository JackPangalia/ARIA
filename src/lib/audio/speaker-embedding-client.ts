"use client";

// Promise-based wrapper around the speaker-embedding Web Worker.

type Pending = {
  resolve: (emb: Float32Array) => void;
  reject: (err: Error) => void;
};

export class SpeakerEmbeddingClient {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 0;
  private fatalError: Error | null = null;

  isAvailable(): boolean {
    return this.worker !== null && this.fatalError === null;
  }

  async ensureReady(): Promise<void> {
    if (this.fatalError) throw this.fatalError;
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      try {
        const worker = new Worker(
          new URL("./speaker-embedding-worker.ts", import.meta.url),
          { type: "module" }
        );
        this.worker = worker;

        worker.addEventListener("message", (ev: MessageEvent) => {
          const data = ev.data as
            | { type: "ready" }
            | { type: "error"; error: string }
            | { type: "embedding"; id: string; embedding: Float32Array }
            | { type: "embed-error"; id: string; error: string };

          if (data.type === "ready") {
            resolve();
            return;
          }
          if (data.type === "error") {
            const err = new Error(`Speaker embedding init: ${data.error}`);
            this.fatalError = err;
            reject(err);
            return;
          }
          if (data.type === "embedding") {
            const p = this.pending.get(data.id);
            if (p) {
              this.pending.delete(data.id);
              p.resolve(data.embedding);
            }
            return;
          }
          if (data.type === "embed-error") {
            const p = this.pending.get(data.id);
            if (p) {
              this.pending.delete(data.id);
              p.reject(new Error(data.error));
            }
            return;
          }
        });

        worker.addEventListener("error", (ev) => {
          const err = new Error(`Speaker embedding worker error: ${ev.message}`);
          this.fatalError = err;
          reject(err);
        });

        worker.postMessage({ type: "init" });
      } catch (err) {
        const e = err instanceof Error ? err : new Error("worker spawn failed");
        this.fatalError = e;
        reject(e);
      }
    });

    return this.readyPromise;
  }

  async embed(pcm: Float32Array): Promise<Float32Array> {
    if (this.fatalError) throw this.fatalError;
    if (!this.worker) throw new Error("Embedding worker not initialized.");

    const id = `${++this.nextId}`;
    const transfer = pcm.buffer.slice(0); // detach a copy so caller keeps theirs
    const copy = new Float32Array(transfer);

    return new Promise<Float32Array>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage(
        { type: "embed", id, pcm: copy },
        { transfer: [copy.buffer] }
      );
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    for (const p of this.pending.values()) {
      p.reject(new Error("Embedding worker disposed."));
    }
    this.pending.clear();
  }
}
