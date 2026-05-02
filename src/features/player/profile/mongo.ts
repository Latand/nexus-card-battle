import { MongoClient, type Collection, type Filter, type WithId } from "mongodb";
import { createNewStoredPlayerProfile, type PlayerIdentity, type StoredPlayerProfile } from "./types";
import type { PlayerProfileStore } from "./api";

const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/nexus-card-battle";
const DEFAULT_MONGODB_DB = "nexus-card-battle";
const PLAYERS_COLLECTION = "players";

type MongoPlayerDocument = Omit<StoredPlayerProfile, "id"> & {
  createdAt: Date;
  updatedAt: Date;
};

const mongoGlobal = globalThis as typeof globalThis & {
  __nexusPlayerMongoClientPromise?: Promise<MongoClient>;
};

export function getMongoPlayerProfileStore() {
  const { uri, dbName } = getMongoConfig();
  const clientPromise = getMongoClient(uri);
  return new MongoPlayerProfileStore(clientPromise, dbName);
}

export class MongoPlayerProfileStore implements PlayerProfileStore {
  private indexesReady?: Promise<void>;

  constructor(
    private readonly clientPromise: Promise<MongoClient>,
    private readonly dbName: string,
  ) {}

  async findOrCreateByIdentity(identity: PlayerIdentity): Promise<StoredPlayerProfile> {
    const collection = await this.getPlayersCollection();
    const now = new Date();
    const filter = identityFilter(identity);
    const insertedProfile = createNewStoredPlayerProfile("", identity);
    const document = await collection.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          identity: insertedProfile.identity,
          ownedCardIds: insertedProfile.ownedCardIds,
          deckIds: insertedProfile.deckIds,
          starterFreeBoostersRemaining: insertedProfile.starterFreeBoostersRemaining,
          openedBoosterIds: insertedProfile.openedBoosterIds,
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

    if (!document) {
      throw new Error("MongoDB did not return a player profile.");
    }

    return fromMongoDocument(document);
  }

  private async getPlayersCollection() {
    const client = await this.clientPromise;
    const collection = client.db(this.dbName).collection<MongoPlayerDocument>(PLAYERS_COLLECTION);
    await this.ensureIndexes(collection);
    return collection;
  }

  private ensureIndexes(collection: Collection<MongoPlayerDocument>) {
    this.indexesReady ??= Promise.all([
      collection.createIndex(
        { "identity.telegramId": 1 },
        {
          name: "uniq_player_telegram_identity",
          unique: true,
          partialFilterExpression: { "identity.mode": "telegram" },
        },
      ),
      collection.createIndex(
        { "identity.guestId": 1 },
        {
          name: "uniq_player_guest_identity",
          unique: true,
          partialFilterExpression: { "identity.mode": "guest" },
        },
      ),
    ]).then(() => undefined);

    return this.indexesReady;
  }
}

function getMongoClient(uri: string) {
  mongoGlobal.__nexusPlayerMongoClientPromise ??= new MongoClient(uri).connect();
  return mongoGlobal.__nexusPlayerMongoClientPromise;
}

function getMongoConfig() {
  const uri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
  return {
    uri,
    dbName: process.env.MONGODB_DB || parseDatabaseName(uri) || DEFAULT_MONGODB_DB,
  };
}

function parseDatabaseName(uri: string) {
  try {
    const pathname = new URL(uri).pathname.replace(/^\//, "");
    return pathname || undefined;
  } catch {
    return undefined;
  }
}

function identityFilter(identity: PlayerIdentity): Filter<MongoPlayerDocument> {
  if (identity.mode === "telegram") {
    return { "identity.mode": "telegram", "identity.telegramId": identity.telegramId };
  }

  return { "identity.mode": "guest", "identity.guestId": identity.guestId };
}

function fromMongoDocument(document: WithId<MongoPlayerDocument>): StoredPlayerProfile {
  return {
    id: document._id.toHexString(),
    identity: document.identity,
    ownedCardIds: document.ownedCardIds,
    deckIds: document.deckIds,
    starterFreeBoostersRemaining: document.starterFreeBoostersRemaining,
    openedBoosterIds: document.openedBoosterIds,
  };
}
