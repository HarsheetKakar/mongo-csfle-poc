const fs = require("fs");
const path = require("path");
const { MongoClient, Binary } = require("mongodb");

// Load the sample document from sample.json
const sampleDoc = JSON.parse(
    fs.readFileSync(path.join(__dirname, "sample.json"), "utf8"),
);

// Load the JSON schema from schema.json
const schema = JSON.parse(
    fs.readFileSync(path.join(__dirname, "schema.json"), "utf8"),
);

// Load the local master key from localKey.txt (must be 96 bytes)
const localMasterKey = fs.readFileSync(path.join(__dirname, "localKey.txt"), {
    encoding: "base64",
});
console.log("local master key", localMasterKey);

// Set up the KMS providers configuration for local key management
const kmsProviders = {
    local: {
        key: localMasterKey,
    },
};

// Define the autoEncryption options. Notice that we set the keyVaultNamespace
// and provide a schemaMap linking our target collection to the encryption schema.
const autoEncryption = {
    keyVaultNamespace: "encryption.__keyVault",
    kmsProviders,
    schemaMap: {
        // Replace "test.encryptedCollection" with your database and collection name
        "test.encryptedCollection": schema,
    },
};

async function run() {
    // Connection URI for your MongoDB Enterprise instance
    const uri = process.env.MONGO_URI; // Create a MongoClient with auto encryption options enabled
    console.log(uri);
    const client = new MongoClient(uri, {
        monitorCommands: true,
        useNewUrlParser: true,
        useUnifiedTopology: true,
        autoEncryption,
    });

    try {
        await client.connect();
        console.log("Client connected");
        const db = client.db("test");
        const collectionName = "encryptedCollection";

        // Ensure the key vault collection exists (this may need to be pre-created
        // with proper indexes to avoid duplicate keys)
        const keyVaultDb = client.db("encryption");
        const keyVaultColl = keyVaultDb.collection("__keyVault");
        // Optionally, create a unique index on keyAltNames if not already created:
        // await keyVaultColl.createIndex({ keyAltNames: 1 }, { unique: true });

        // Create the target collection if it doesn't exist
        const collections = await db
            .listCollections({ name: collectionName })
            .toArray();
        if (collections.length === 0) {
            await db.createCollection(collectionName);
            console.log(`Created collection: ${collectionName}`);
        }
        const collection = db.collection(collectionName);

        // Insert the sample document – CSFLE will automatically encrypt fields as defined in schema.json
        const result = await collection.insertOne(sampleDoc);
        console.log("Document inserted with _id:", result.insertedId);
    } catch (err) {
        console.error("Error during CSFLE operation:", err);
    } finally {
        await client.close();
    }
}

run();
