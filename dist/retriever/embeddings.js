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
const HF_API_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";
/**
 * Generates an embedding vector using the free Hugging Face Inference API.
 * Uses all-MiniLM-L6-v2 — 384-dim vectors, same quality as local model.
 * Zero npm dependencies — just native fetch.
 * Requires HF_TOKEN env variable (free at https://huggingface.co/settings/tokens).
 */
async function generateEmbedding(text) {
    const token = process.env.HF_TOKEN;
    if (!token) {
        throw new Error("HF_TOKEN not set. Get a free token at https://huggingface.co/settings/tokens");
    }
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
    };
    const response = await fetch(HF_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ inputs: text }),
    });
    if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    // API returns nested array for single input — extract the vector
    if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === "number") {
        return data[0];
    }
    if (Array.isArray(data) && typeof data[0] === "number") {
        return data;
    }
    throw new Error("Unexpected embedding API response format");
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
