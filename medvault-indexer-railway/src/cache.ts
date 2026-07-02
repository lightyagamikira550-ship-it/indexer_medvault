import { createClient, RedisClientType } from "redis";

export type CacheTag =
  | "trials"
  | `trial:${string}`
  | `sponsor:${string}`
  | `applications:${string}`;

export class IndexerCache {
  private client: RedisClientType;
  private defaultTtlSec: number;

  constructor(redisUrl: string, defaultTtlSec: number) {
    this.client = createClient({ url: redisUrl });
    this.defaultTtlSec = defaultTtlSec;
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  private tagSetKey(tag: CacheTag): string {
    return `indexer:tag:${tag}`;
  }

  private entryKey(key: string): string {
    return `indexer:cache:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(this.entryKey(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, tags: CacheTag[], ttlSec = this.defaultTtlSec): Promise<void> {
    const payload = JSON.stringify(value);
    const entry = this.entryKey(key);
    await this.client.set(entry, payload, { EX: ttlSec });
    for (const tag of tags) {
      await this.client.sAdd(this.tagSetKey(tag), entry);
      await this.client.expire(this.tagSetKey(tag), ttlSec * 2);
    }
  }

  /** Invalidate all cache entries tagged with any of the given tags. */
  async invalidateTags(tags: CacheTag[]): Promise<void> {
    const keys = new Set<string>();
    for (const tag of tags) {
      const members = await this.client.sMembers(this.tagSetKey(tag));
      for (const m of members) keys.add(m);
      await this.client.del(this.tagSetKey(tag));
    }
    if (keys.size > 0) {
      await this.client.del([...keys]);
    }
  }

  tagsForTrial(trialId: string): CacheTag[] {
    return ["trials", `trial:${trialId}`, `applications:${trialId}`];
  }

  tagsForSponsor(sponsor: string): CacheTag[] {
    return [`sponsor:${sponsor.toLowerCase()}`, "trials"];
  }
}
