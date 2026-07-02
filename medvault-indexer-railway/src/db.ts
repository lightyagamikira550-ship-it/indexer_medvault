import { MongoClient, Db, Collection } from "mongodb";
import type {
  IndexedApplication,
  IndexedConsent,
  IndexedDocument,
  IndexedReward,
  IndexedTrial,
  EventKey,
} from "./types.js";

export class IndexerDb {
  private client: MongoClient;
  private db!: Db;

  constructor(private uri: string) {
    this.client = new MongoClient(uri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db();
    await Promise.all([
      this.trials().createIndex({ trialId: 1 }, { unique: true }),
      this.applications().createIndex({ trialId: 1 }),
      this.applications().createIndex({ eventKey: 1 }, { unique: true }),
      this.consents().createIndex({ trialId: 1, patient: 1 }),
      this.consents().createIndex({ eventKey: 1 }, { unique: true }),
      this.rewards().createIndex({ trialId: 1 }),
      this.rewards().createIndex({ eventKey: 1 }, { unique: true }),
      this.documents().createIndex({ trialId: 1, nullifier: 1 }),
      this.documents().createIndex({ eventKey: 1 }, { unique: true }),
    ]);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  trials(): Collection<IndexedTrial> {
    return this.db.collection<IndexedTrial>("trials");
  }

  applications(): Collection<IndexedApplication> {
    return this.db.collection<IndexedApplication>("applications");
  }

  consents(): Collection<IndexedConsent> {
    return this.db.collection<IndexedConsent>("consents");
  }

  rewards(): Collection<IndexedReward> {
    return this.db.collection<IndexedReward>("rewards");
  }

  documents(): Collection<IndexedDocument> {
    return this.db.collection<IndexedDocument>("documents");
  }

  /** Upsert trial by trialId (canonical entity id); eventKey tracks last write source. */
  async upsertTrial(doc: IndexedTrial): Promise<void> {
    await this.trials().updateOne(
      { trialId: doc.trialId },
      { $set: doc, $setOnInsert: { _id: doc._id } },
      { upsert: true }
    );
  }

  async upsertApplication(doc: IndexedApplication): Promise<void> {
    await this.applications().updateOne(
      { eventKey: doc.eventKey },
      { $set: doc, $setOnInsert: { _id: doc._id } },
      { upsert: true }
    );
  }

  async upsertConsent(doc: IndexedConsent): Promise<void> {
    await this.consents().updateOne(
      { eventKey: doc.eventKey },
      { $set: doc, $setOnInsert: { _id: doc._id } },
      { upsert: true }
    );
  }

  async upsertReward(doc: IndexedReward): Promise<void> {
    await this.rewards().updateOne(
      { eventKey: doc.eventKey },
      { $set: doc, $setOnInsert: { _id: doc._id } },
      { upsert: true }
    );
  }

  async upsertDocument(doc: IndexedDocument): Promise<void> {
    await this.documents().updateOne(
      { eventKey: doc.eventKey },
      { $set: doc, $setOnInsert: { _id: doc._id } },
      { upsert: true }
    );
  }

  async countTrials(): Promise<number> {
    return this.trials().countDocuments();
  }

  async countApplications(): Promise<number> {
    return this.applications().countDocuments();
  }

  async trialIds(): Promise<string[]> {
    const rows = await this.trials().find({}, { projection: { trialId: 1 } }).toArray();
    return rows.map((r) => r.trialId).sort();
  }

  async getByEventKey(collection: "trials" | "applications" | "consents" | "rewards" | "documents", key: EventKey) {
    switch (collection) {
      case "trials":
        return this.trials().findOne({ eventKey: key });
      case "applications":
        return this.applications().findOne({ eventKey: key });
      case "consents":
        return this.consents().findOne({ eventKey: key });
      case "rewards":
        return this.rewards().findOne({ eventKey: key });
      case "documents":
        return this.documents().findOne({ eventKey: key });
    }
  }
}
