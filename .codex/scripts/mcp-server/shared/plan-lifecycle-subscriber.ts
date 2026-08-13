import type { RuntimeContextKey } from "./runtime-context.js"
import type { PlanStatusResolution } from "./plan-lifecycle.js"
import {
  isLifecycleEventForContext,
  parsePlanLifecycleChangedEnvelope,
  PLAN_LIFECYCLE_CHANNEL,
  type PlanLifecycleChangedEnvelope,
} from "./plan-lifecycle-events.js"

export interface PgNotification {
  channel: string
  payload?: string
}

export interface LifecycleListenClient {
  connect(): Promise<unknown>
  query(sql: string): Promise<unknown>
  end(): Promise<void>
  on(event: "notification", listener: (message: PgNotification) => void): this
  on(event: "error", listener: (error: Error) => void): this
  on(event: "end", listener: () => void): this
  removeAllListeners(): this
}

export type LifecycleListenClientFactory = () => LifecycleListenClient | Promise<LifecycleListenClient>

export interface PlanLifecycleSubscriberOptions {
  context: RuntimeContextKey
  clientFactory: LifecycleListenClientFactory
  resolveStatus(input: {
    context: RuntimeContextKey
    planId?: string
    reason: "initial" | "notification" | "reconnect"
  }): Promise<PlanStatusResolution>
  onSnapshot(snapshot: PlanStatusResolution, envelope?: PlanLifecycleChangedEnvelope): void | Promise<void>
  onError?(error: Error): void
  reconnectDelayMs?: number
}

export class PlanLifecycleSubscriber {
  readonly #options: PlanLifecycleSubscriberOptions
  #client: LifecycleListenClient | null = null
  #stopping = false
  #startedOnce = false
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null
  #refreshQueue: Promise<void> = Promise.resolve()

  constructor(options: PlanLifecycleSubscriberOptions) {
    this.#options = options
  }

  async start(): Promise<void> {
    if (this.#client) return
    this.#stopping = false
    try {
      await this.#connectAndHydrate("initial")
    } catch (error) {
      this.#scheduleReconnect()
      throw error
    }
  }

  async stop(): Promise<void> {
    this.#stopping = true
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = null
    const client = this.#client
    this.#client = null
    if (!client) return
    client.removeAllListeners()
    try { await client.query(`UNLISTEN ${PLAN_LIFECYCLE_CHANNEL}`) } catch { /* connection may already be gone */ }
    await client.end().catch(() => undefined)
    await this.#refreshQueue
  }

  async #connectAndHydrate(reason: "initial" | "reconnect"): Promise<void> {
    const client = await this.#options.clientFactory()
    this.#client = client
    client.on("notification", (message) => this.#handleNotification(message))
    client.on("error", (error) => this.#handleDisconnect(client, error))
    client.on("end", () => this.#handleDisconnect(client, new Error("PostgreSQL LISTEN session ended")))
    try {
      await client.connect()
      await client.query(`LISTEN ${PLAN_LIFECYCLE_CHANNEL}`)
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
    if (this.#stopping || message.channel !== PLAN_LIFECYCLE_CHANNEL) return
    const envelope = parsePlanLifecycleChangedEnvelope(message.payload)
    if (!envelope || !isLifecycleEventForContext(envelope, this.#options.context)) return
    this.#refreshQueue = this.#refreshQueue
      .then(() => this.#refresh(envelope, "notification"))
      .catch((error: unknown) => this.#options.onError?.(error instanceof Error ? error : new Error(String(error))))
  }

  #handleDisconnect(client: LifecycleListenClient, error: Error): void {
    if (this.#stopping || this.#client !== client) return
    this.#client = null
    client.removeAllListeners()
    this.#options.onError?.(error)
    if (this.#reconnectTimer) return
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      if (this.#stopping) return
      this.#connectAndHydrate(this.#startedOnce ? "reconnect" : "initial")
        .catch(() => this.#scheduleReconnect())
    }, this.#options.reconnectDelayMs ?? 1000)
  }

  #scheduleReconnect(): void {
    if (this.#stopping || this.#reconnectTimer) return
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      this.#connectAndHydrate(this.#startedOnce ? "reconnect" : "initial")
        .catch(() => this.#scheduleReconnect())
    }, this.#options.reconnectDelayMs ?? 1000)
  }

  async #refresh(
    envelope: PlanLifecycleChangedEnvelope | undefined,
    reason: "initial" | "notification" | "reconnect",
  ): Promise<void> {
    const snapshot = await this.#options.resolveStatus({
      context: this.#options.context,
      planId: envelope?.planId,
      reason,
    })
    await this.#options.onSnapshot(snapshot, envelope)
  }
}

export async function createPgLifecycleListenClient(databaseUrl: string): Promise<LifecycleListenClient> {
  const { Client } = await import("pg")
  return new Client({ connectionString: databaseUrl })
}
