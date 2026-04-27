import { EventEmitter } from "node:events";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { normalizeEvent } from "../../shared-schema/src/index.js";

export class RingBuffer {
  constructor(limit = 1000) {
    this.limit = limit;
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    if (this.items.length > this.limit) {
      this.items.splice(0, this.items.length - this.limit);
    }
  }

  since(eventId) {
    if (!eventId) return [...this.items];
    const index = this.items.findIndex((event) => event.id === eventId);
    return index >= 0 ? this.items.slice(index + 1) : [...this.items];
  }
}

export class EventBus {
  constructor({ bufferSize = 2000 } = {}) {
    this.emitter = new EventEmitter();
    this.buffer = new RingBuffer(bufferSize);
    this.sequences = new Map();
  }

  nextSequence(runId) {
    const key = runId || "global";
    const next = (this.sequences.get(key) || 0) + 1;
    this.sequences.set(key, next);
    return next;
  }

  publish(input) {
    const event = normalizeEvent({
      ...input,
      sequence: input.sequence || this.nextSequence(input.runId)
    });
    this.buffer.push(event);
    this.emitter.emit("event", event);
    return event;
  }

  subscribe(listener) {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  recent({ since, types = [] } = {}) {
    const events = this.buffer.since(since);
    return types.length ? events.filter((event) => types.includes(event.type)) : events;
  }
}

export class JsonlEventStore {
  constructor({ dataRoot }) {
    this.dataRoot = dataRoot;
  }

  async append(event) {
    if (!event.experimentId || !event.iterationId) return;
    const iterationDir = path.join(
      this.dataRoot,
      event.experimentId,
      "iterations",
      event.iterationId
    );
    await mkdir(iterationDir, { recursive: true });
    await appendFile(path.join(iterationDir, "events.jsonl"), `${JSON.stringify(event)}\n`);

    if (event.type === "metric") {
      await appendFile(path.join(iterationDir, "metrics.jsonl"), `${JSON.stringify(event)}\n`);
    }

    if (event.type === "runner.log") {
      const logsDir = path.join(iterationDir, "logs");
      await mkdir(logsDir, { recursive: true });
      const line = `[${event.timestamp}] ${event.payload.stream || "stdout"} ${event.payload.message || ""}\n`;
      await appendFile(path.join(logsDir, "run.log"), line);
    }
  }
}
