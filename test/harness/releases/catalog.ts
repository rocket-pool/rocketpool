import crypto from "crypto";
import fs from "fs";
import path from "path";

export type HistoricalRelease = "1.3.1" | "1.4";
export type Release = HistoricalRelease | "current";

export interface ReleaseArtifact {
    contractName: string;
    sourceName: string;
    abi: readonly any[];
    bytecode: string;
    deployedBytecode: string;
    linkReferences: Record<string, unknown>;
    deployedLinkReferences: Record<string, unknown>;
}

interface ArtifactManifestEntry {
    file: string;
    integrity: string;
    sourceName: string;
}

interface ReleaseManifest {
    schemaVersion: number;
    release: HistoricalRelease;
    source: {
        tag: string;
        commit: string;
    };
    compilers: string[];
    artifacts: Record<string, ArtifactManifestEntry>;
    integrity: string;
}

const manifestCache = new Map<HistoricalRelease, ReleaseManifest>();
const artifactCache = new Map<string, ReleaseArtifact>();

function releaseDirectory(release: HistoricalRelease): string {
    return path.resolve(import.meta.dirname, `v${release}`);
}

function hash(contents: string): string {
    return `sha256:${crypto.createHash("sha256").update(contents).digest("hex")}`;
}

export function getReleaseManifest(release: HistoricalRelease): ReleaseManifest {
    const cached = manifestCache.get(release);
    if (cached) return cached;

    const manifestPath = path.join(releaseDirectory(release), "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ReleaseManifest;
    if (manifest.schemaVersion !== 1 || manifest.release !== release) {
        throw new Error(`Unsupported or mismatched Rocket Pool release manifest: ${manifestPath}`);
    }

    const { integrity, ...unsigned } = manifest;
    const expected = hash(`${JSON.stringify(unsigned, null, 2)}\n`);
    if (integrity !== expected) {
        throw new Error(`Release manifest integrity check failed for ${release}`);
    }

    manifestCache.set(release, manifest);
    return manifest;
}

export function getReleaseArtifact(
    release: HistoricalRelease,
    contractName: string,
): ReleaseArtifact {
    const cacheKey = `${release}:${contractName}`;
    const cached = artifactCache.get(cacheKey);
    if (cached) return cached;

    const manifest = getReleaseManifest(release);
    const entry = manifest.artifacts[contractName];
    if (!entry) {
        throw new Error(`Contract ${contractName} is not present in Rocket Pool ${release}`);
    }

    const artifactPath = path.resolve(releaseDirectory(release), entry.file);
    const contents = fs.readFileSync(artifactPath, "utf8");
    if (hash(contents) !== entry.integrity) {
        throw new Error(`Artifact integrity check failed for ${release}:${contractName}`);
    }

    const artifact = JSON.parse(contents) as ReleaseArtifact;
    artifactCache.set(cacheKey, artifact);
    return artifact;
}

export function validateRelease(release: HistoricalRelease): void {
    const manifest = getReleaseManifest(release);
    for (const contractName of Object.keys(manifest.artifacts)) {
        getReleaseArtifact(release, contractName);
    }
}
