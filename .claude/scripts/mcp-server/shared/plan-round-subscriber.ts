import type { RuntimeContextKey } from "./runtime-context.js"
import type { LifecycleListenClient, LifecycleListenClientFactory, PgNotification } from "./plan-lifecycle-subscriber.js"
import type { PlanRoundSnapshot } from "./plan-round-store.js"
import {
  isPlanRoundEventForContext,
  parsePlanRoundChangedEnvelope,
  PLAN_ROUND_CHANNEL,
  type PlanRoundChangedEnvelope,
} from "./plan-round-events.js"

export interface PlanRoundSubscriberOptions {
  context: RuntimeContextKey
  clientFactory: LifecycleListenClientFactory
  queryRounds(input: { context: RuntimeContextKey; planId?: string; reason: "initial" | "notification" | "reconnect" }): Promise<PlanRoundSnapshot>
  onSnapshot(snapshot: PlanRoundSnapshot, envelope?: PlanRoundChangedEnvelope): void | Promise<void>
  onError?(error: Error): void
  reconnectDelayMs?: number
}

export class PlanRoundSubscriber {
  readonly #options: PlanRoundSubscriberOptions
  #client: LifecycleListenClient | null = null
  #stopping = false
  #startedOnce = false
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null
  #refreshQueue: Promise<void> = Promise.resolve()

  constructor(options: PlanRoundSubscriberOptions) { this.#options = options }

  async start(): Promise<void> {
    if (this.#client) return
    this.#stopping = false
    try { await this.#connectAndHydrate("initial") } catch (error) { this.#scheduleReconnect(); throw error }
  }

  async stop(): Promise<void> {
    this.#stopping = true
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = null
    const client = this.#client
    this.#client = null
    if (!client) return
    client.removeAllListeners()
    try { await client.query(`UNLISTEN ${PLAN_ROUND_CHANNEL}`) } catch { /* connection may already be gone */ }
    await client.end().catch(() => undefined)
    await this.#refreshQueue
  }

  async #connectAndHydrate(reason: "initial" | "reconnect"): Promise<void> {
    const client = await this.#options.clientFactory()
    this.#client = client
    client.on("notification", (message: PgNotification) => this.#handleNotification(message))
    client.on("error", (error: Error) => this.#handleDisconnect(client, error))
    client.on("end", () => this.#handleDisconnect(client, new Error("PostgreSQL PlanRound LISTEN session ended")))
    try {
      await client.connect()
      await client.query(`LISTEN ${PLAN_ROUND_CHANNEL}`)
      await this.#refresh(undefined, reason)
      this.#startedOnce = true
    } catch (error) {
      if (this.#client === client) this.#client = null
      client.removeAllListeners()
      await client.end().catch(() => undefined)
      const normalized = error instanceof Error ? error : new Error(String(error))
      this.#options.onError?.(normalized)
      throw normalized
    }
  }

  #handleNotification(message: PgNotification): void {
    if (this.#stopping || message.channel !== PLAN_ROUND_CHANNEL) return
    const envelope = parsePlanRoundChangedEnvelope(message.payload)
    if (!envelope || !isPlanRoundEventForContext(envelope, this.#options.context)) return
    this.#refreshQueue = this.#refreshQueue
      .then(() => this.#refresh(envelope, "notification"))
      .catch((error: unknown) => this.#options.onError?.(error instanceof Error ? error : new Error(String(error))))
  }

  #handleDisconnect(client: LifecycleListenClient, error: Error): void {
    if (this.#stopping || this.#client !== client) return
    this.#client = null
    client.removeAllListeners()
    this.#options.onError?.(error)
    this.#scheduleReconnect()
  }

  #scheduleReconnect(): void {
    if (this.#stopping || this.#reconnectTimer) return
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      this.#connectAndHydrate(this.#startedOnce ? "reconnect" : "initial").catch(() => this.#scheduleReconnect())
    }, this.#options.reconnectDelayMs ?? 1000)
  }

  async #refresh(envelope: PlanRoundChangedEnvelope | undefined, reason: "initial" | "notification" | "reconnect"): Promise<void> {
    const snapshot = await this.#options.queryRounds({ context: this.#options.context, planId: envelope?.planId, reason })
    await this.#options.onSnapshot(snapshot, envelope)
  }
}
