/**
 * Atomic File Operations
 *
 * Provides atomic file writes using the write-to-temp-then-rename pattern.
 * This ensures files are never left in a partially written state.
 */

import { mkdirSync, renameSync, unlinkSync, existsSync } from "fs";
import { dirname, join } from "path";

/**
 * Write content to a file atomically.
 *
 * Uses write-to-temp-then-rename pattern:
 * 1. Write to a temporary file in the same directory
 * 2. Rename temp file to target (atomic on POSIX)
 *
 * @param targetPath The final path for the file
 * @param content The content to write
 * @returns The path to the written file
 */
export async function atomicWrite(
  targetPath: string,
  content: string
): Promise<string> {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });

  // Create temp file in same directory (same filesystem = atomic rename)
  const tempPath = join(dir, `.tmp-${crypto.randomUUID()}`);

  try {
    // Write to temp file
    await Bun.write(tempPath, content);

    // Atomic rename
    renameSync(tempPath, targetPath);

    return targetPath;
  } catch (err) {
    // Clean up temp file on error
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Write multiple files atomically.
 *
 * All files are written to temp locations first, then renamed.
 * If any write fails, all temp files are cleaned up.
 *
 * @param writes Array of { path, content } objects
 * @returns Array of written file paths
 */
export async function atomicWriteMultiple(
  writes: { path: string; content: string }[]
): Promise<string[]> {
  const tempFiles: string[] = [];
  const results: string[] = [];

  try {
    // Phase 1: Write all files to temp locations
    for (const { path: targetPath, content } of writes) {
      const dir = dirname(targetPath);
      mkdirSync(dir, { recursive: true });

      const tempPath = join(dir, `.tmp-${crypto.randomUUID()}`);
      await Bun.write(tempPath, content);
      tempFiles.push(tempPath);
    }

    // Phase 2: Rename all temp files atomically
    for (let i = 0; i < writes.length; i++) {
      renameSync(tempFiles[i], writes[i].path);
      results.push(writes[i].path);
    }

    return results;
  } catch (err) {
    // Clean up any temp files on error
    for (const tempPath of tempFiles) {
      try {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    throw err;
  }
}
