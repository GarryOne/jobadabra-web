// The old Worker's whole code after the transfer: it forwards every request to the AI broker, so callers on jobadabra-codex-broker.<account>.workers.dev keep working until they have moved (spec 2026-11-01-ai-broker-design.md).
// Why (1 Nov 2026, owner: rename to ai-broker): the `CodexBroker` stub only exists because a `transferred` tombstone may keep its class in code (Cloudflare's zero-downtime pattern); the cleanup PR removes the stub and this Worker.
import {DurableObject} from 'cloudflare:workers';

export class CodexBroker extends DurableObject {}

export default {
  fetch: (request, env) => env.AI_BROKER.fetch(request),
};
