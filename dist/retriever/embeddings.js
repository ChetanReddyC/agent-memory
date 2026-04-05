"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingStore = void 0;
exports.generateEmbedding = generateEmbedding;
exports.buildEmbeddingText = buildEmbeddingText;
exports.cosineSimilarity = cosineSimilarity;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let pipeline = null;
let pipelineLoading = null;
/**
 * Lazily loads the embedding model. First call downloads ~30MB model (cached after).
 * Uses all-MiniLM-L6-v2 — 384-dim vectors, fast, good quality.
 */
async function getEmbeddingPipeline() {
    if (pipeline)
        return pipeline;
    if (!pipelineLoading) {
        pipelineLoading = (async () => {
            const { pipeline: createPipeline } = await Promise.resolve().then(() => __importStar(require("@huggingface/transformers")));
            pipeline = await createPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
            return pipeline;
        })();
    }
    return pipelineLoading;
}
/**
 * Generates an embedding vector for the given text.
 * Returns a 384-dimensional float array.
 */
async function generateEmbedding(text) {
    const extractor = await getEmbeddingPipeline();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
}
/**
 * Builds the text to embed from a memory record.
 * Concatenates the semantic fields — skips file paths and tags (handled by file_overlap scoring).
 */
function buildEmbeddingText(memory) {
    return [
        memory.intent,
        ...memory.decisions,
        ...memory.failed_approaches,
        ...memory.warnings,
        memory.resolution,
        ...(memory.error_signatures || []),
        ...(memory.cause_chain || []),
        ...(memory.file_dependencies || []),
        memory.key_insight || "",
    ]
        .filter((s) => s.length > 0)
        .join(". ");
}
/**
 * Compute cosine similarity between two vectors. Returns 0-1.
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0)
        return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0)
        return 0;
    return dotProduct / denominator;
}
/**
 * Embedding store — manages the embeddings.json index file.
 */
class EmbeddingStore {
    filePath;
    cache = {};
    constructor(memoriesDir) {
        this.filePath = path.join(memoriesDir, "embeddings.json");
        this.load();
    }
    load() {
        if (fs.existsSync(this.filePath)) {
            const raw = fs.readFileSync(this.filePath, "utf-8");
            this.cache = JSON.parse(raw);
        }
    }
    save() {
        fs.writeFileSync(this.filePath, JSON.stringify(this.cache), "utf-8");
    }
    get(checkpointId) {
        return this.cache[checkpointId] || null;
    }
    set(checkpointId, vector) {
        this.cache[checkpointId] = vector;
    }
    has(checkpointId) {
        return checkpointId in this.cache;
    }
    getAll() {
        return this.cache;
    }
}
exports.EmbeddingStore = EmbeddingStore;
