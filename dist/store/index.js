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
exports.MemoryStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Simple file-based memory store.
 * Each memory record is saved as a JSON file in the memories directory.
 * Named by checkpoint_id for easy lookup and dedup.
 */
class MemoryStore {
    memoriesDir;
    constructor(memoriesDir) {
        this.memoriesDir = memoriesDir;
        if (!fs.existsSync(memoriesDir)) {
            fs.mkdirSync(memoriesDir, { recursive: true });
        }
    }
    /** Sanitize checkpoint ID for filesystem (: not allowed on Windows) */
    sanitizeId(checkpointId) {
        return checkpointId.replace(/:/g, "_");
    }
    /** Save a memory record */
    save(record) {
        const filePath = path.join(this.memoriesDir, `${this.sanitizeId(record.checkpoint_id)}.json`);
        fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
    }
    /** Load a specific memory by checkpoint ID */
    load(checkpointId) {
        const filePath = path.join(this.memoriesDir, `${this.sanitizeId(checkpointId)}.json`);
        if (!fs.existsSync(filePath))
            return null;
        const raw = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(raw);
    }
    /** Load all memories */
    loadAll() {
        if (!fs.existsSync(this.memoriesDir))
            return [];
        return fs
            .readdirSync(this.memoriesDir)
            .filter((f) => f.endsWith(".json") && f !== "embeddings.json")
            .map((f) => {
            const raw = fs.readFileSync(path.join(this.memoriesDir, f), "utf-8");
            return JSON.parse(raw);
        })
            .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first
    }
    /** Check if a checkpoint has already been distilled */
    exists(checkpointId) {
        return fs.existsSync(path.join(this.memoriesDir, `${this.sanitizeId(checkpointId)}.json`));
    }
    /** Count total memories */
    count() {
        if (!fs.existsSync(this.memoriesDir))
            return 0;
        return fs.readdirSync(this.memoriesDir).filter((f) => f.endsWith(".json") && f !== "embeddings.json").length;
    }
}
exports.MemoryStore = MemoryStore;
