/**
 * Document Review Server
 *
 * Provides a server implementation for reviewing and annotating arbitrary markdown files.
 * Follows the same patterns as the plan and review servers.
 *
 * Environment variables:
 *   PLANNOTATOR_REMOTE - Set to "1" or "true" for remote/devcontainer mode
 *   PLANNOTATOR_PORT   - Fixed port to use (default: random locally, 19432 for remote)
 */

import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { homedir } from "os";
import { isRemoteSession, getServerPort } from "./remote";
import { openBrowser } from "./browser";
import { getRepoInfo } from "./repo";
import { validatePath, sanitizeFilename, isAllowedImageExtension } from "./security";

// Re-export utilities
export { isRemoteSession, getServerPort } from "./remote";
export { openBrowser } from "./browser";

// --- Types ---

export interface DocServerOptions {
  /** The markdown content to review */
  markdown: string;
  /** The file path being reviewed (for display and relative link resolution) */
  filepath: string;
  /** HTML content to serve for the UI */
  htmlContent: string;
  /** Origin identifier for UI customization */
  origin?: "opencode" | "claude-code";
  /** Whether URL sharing is enabled (default: true) */
  sharingEnabled?: boolean;
  /** Project root directory for resolving relative paths (defaults to cwd at server start) */
  projectRoot?: string;
  /** Called when server starts with the URL, remote status, and port */
  onReady?: (url: string, isRemote: boolean, port: number) => void;
  /** OpenCode client for querying available agents (OpenCode only) */
  opencodeClient?: {
    app: {
      agents: (options?: object) => Promise<{ data?: Array<{ name: string; description?: string; mode: string; hidden?: boolean }> }>;
    };
  };
}

export interface DocServerResult {
  /** The port the server is running on */
  port: number;
  /** The full URL to access the server */
  url: string;
  /** Whether running in remote mode */
  isRemote: boolean;
  /** Wait for user decision (approve or feedback) */
  waitForDecision: () => Promise<{
    approved: boolean;
    feedback?: string;
    annotations?: unknown[];
    agentSwitch?: string;
  }>;
  /** Stop the server */
  stop: () => void;
}

// --- Server Implementation ---

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 500;

/**
 * Start the Document Review server
 *
 * Handles:
 * - Remote detection and port configuration
 * - API routes (/api/doc, /api/feedback, /api/approve)
 * - Linked document loading (read-only)
 * - Port conflict retries
 */
export async function startDocServer(
  options: DocServerOptions
): Promise<DocServerResult> {
  const { markdown, filepath, htmlContent, origin, sharingEnabled = true, onReady } = options;

  // Capture project root at server start (before any async operations change cwd)
  const projectRoot = options.projectRoot || process.cwd();

  const isRemote = isRemoteSession();
  const configuredPort = getServerPort();

  // Detect repo info (cached for this session)
  const repoInfo = await getRepoInfo();

  // Base directory for resolving relative paths (document's directory)
  const baseDir = dirname(resolve(filepath));

  // Decision promise
  let resolveDecision: (result: {
    approved: boolean;
    feedback?: string;
    annotations?: unknown[];
    agentSwitch?: string;
  }) => void;
  const decisionPromise = new Promise<{
    approved: boolean;
    feedback?: string;
    annotations?: unknown[];
    agentSwitch?: string;
  }>((resolve) => {
    resolveDecision = resolve;
  });

  // Start server with retry logic
  let server: ReturnType<typeof Bun.serve> | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      server = Bun.serve({
        port: configuredPort,

        async fetch(req) {
          const url = new URL(req.url);

          // API: Get document content (main or linked)
          if (url.pathname === "/api/doc" && req.method === "GET") {
            const requestedPath = url.searchParams.get("path");
            const readOnly = url.searchParams.get("readonly") === "true";

            if (requestedPath) {
              // Loading a linked document
              try {
                // Try multiple resolution strategies:
                // 1. If absolute path, use as-is
                // 2. Resolve relative to document's directory (baseDir)
                // 3. If not found, try resolving relative to projectRoot
                // 4. If bare filename (no /), search projectRoot for exact name match
                let resolvedPath: string;
                let file: ReturnType<typeof Bun.file>;
                let found = false;

                if (requestedPath.startsWith('/')) {
                  // Absolute path
                  resolvedPath = requestedPath;
                  file = Bun.file(resolvedPath);
                  found = await file.exists();
                } else {
                  // Try relative to document directory first
                  resolvedPath = resolve(baseDir, requestedPath);
                  file = Bun.file(resolvedPath);
                  found = await file.exists();

                  if (!found) {
                    // Not found - try relative to projectRoot
                    const projectResolved = resolve(projectRoot, requestedPath);
                    const projectFile = Bun.file(projectResolved);
                    if (await projectFile.exists()) {
                      resolvedPath = projectResolved;
                      found = true;
                    }
                  }

                  // If still not found and it's a bare filename (no path separator),
                  // search the entire projectRoot for exact name matches
                  if (!found && !requestedPath.includes('/')) {
                    const glob = new Bun.Glob(`**/${requestedPath}`);
                    const matches: string[] = [];

                    for await (const match of glob.scan({ cwd: projectRoot, onlyFiles: true })) {
                      // Only include if the filename matches exactly (not just ends with)
                      const matchFilename = match.split('/').pop();
                      if (matchFilename === requestedPath) {
                        matches.push(resolve(projectRoot, match));
                      }
                    }

                    if (matches.length === 1) {
                      resolvedPath = matches[0];
                      found = true;
                    } else if (matches.length > 1) {
                      // Ambiguous - multiple files with same name
                      const relativePaths = matches.map(m => m.replace(projectRoot + '/', ''));
                      return Response.json(
                        {
                          error: `Ambiguous filename '${requestedPath}' - found ${matches.length} matches:\n${relativePaths.join('\n')}`
                        },
                        { status: 400 }
                      );
                    }
                  }
                }

                // SEC-1: Validate path stays within allowed directories
                const allowedBases = [baseDir, projectRoot];
                const isAllowed = allowedBases.some(base =>
                  resolvedPath === base || resolvedPath.startsWith(base + "/")
                );

                if (!isAllowed) {
                  return Response.json(
                    { error: "Path traversal attempt blocked" },
                    { status: 403 }
                  );
                }

                if (!found) {
                  return Response.json(
                    { error: `File not found: ${requestedPath}` },
                    { status: 404 }
                  );
                }

                file = Bun.file(resolvedPath);

                const content = await file.text();
                return Response.json({
                  markdown: content,
                  filepath: resolvedPath,
                  origin,
                  isMain: false,
                  readOnly: true, // Linked docs are always read-only (MVP)
                  sharingEnabled,
                  repoInfo,
                });
              } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to load file";
                return Response.json({ error: message }, { status: 500 });
              }
            }

            // Main document
            return Response.json({
              markdown,
              filepath,
              origin,
              isMain: true,
              readOnly: readOnly,
              sharingEnabled,
              repoInfo,
            });
          }

          // API: Serve images (local paths or temp uploads)
          if (url.pathname === "/api/image") {
            const imagePath = url.searchParams.get("path");
            if (!imagePath) {
              return new Response("Missing path parameter", { status: 400 });
            }
            try {
              // Validate path is within allowed directories
              const allowedBases = ["/tmp/plannotator", homedir(), baseDir];
              const validatedPath = validatePath(imagePath, allowedBases);

              const file = Bun.file(validatedPath);
              if (!(await file.exists())) {
                return new Response("File not found", { status: 404 });
              }
              return new Response(file);
            } catch (err) {
              const message = err instanceof Error ? err.message : "Failed to read file";
              if (message.includes("Path not allowed")) {
                return new Response("Access denied", { status: 403 });
              }
              return new Response("Failed to read file", { status: 500 });
            }
          }

          // API: Upload image -> save to temp -> return path
          if (url.pathname === "/api/upload" && req.method === "POST") {
            try {
              const formData = await req.formData();
              const file = formData.get("file") as File;
              if (!file) {
                return new Response("No file provided", { status: 400 });
              }

              // SEC-6: Enforce file size limit (10MB)
              const MAX_FILE_SIZE = 10 * 1024 * 1024;
              if (file.size > MAX_FILE_SIZE) {
                return new Response("File too large (max 10MB)", { status: 413 });
              }

              // SEC-2: Validate file extension
              if (!isAllowedImageExtension(file.name)) {
                return new Response("File type not allowed", { status: 415 });
              }

              // SEC-7: Sanitize filename and extract extension
              const safeFilename = sanitizeFilename(file.name);
              const ext = safeFilename.split(".").pop() || "png";
              const tempDir = "/tmp/plannotator";
              mkdirSync(tempDir, { recursive: true, mode: 0o700 });
              const tempPath = `${tempDir}/${crypto.randomUUID()}.${ext}`;

              // SEC-8: Write with restrictive permissions
              await Bun.write(tempPath, file, { mode: 0o600 });
              return Response.json({ path: tempPath });
            } catch (err) {
              const message = err instanceof Error ? err.message : "Upload failed";
              return Response.json({ error: message }, { status: 500 });
            }
          }

          // API: Get available agents (OpenCode only)
          if (url.pathname === "/api/agents") {
            if (!options.opencodeClient) {
              return Response.json({ agents: [] });
            }

            try {
              const result = await options.opencodeClient.app.agents({});
              const agents = (result.data ?? [])
                .filter((a) => a.mode === "primary" && !a.hidden)
                .map((a) => ({ id: a.name, name: a.name, description: a.description }));

              return Response.json({ agents });
            } catch {
              return Response.json({ agents: [], error: "Failed to fetch agents" });
            }
          }

          // API: Approve document (no changes needed)
          if (url.pathname === "/api/approve" && req.method === "POST") {
            try {
              const body = (await req.json().catch(() => ({}))) as {
                agentSwitch?: string;
              };

              resolveDecision({
                approved: true,
                feedback: "LGTM - no changes needed",
                agentSwitch: body.agentSwitch,
              });

              return Response.json({ ok: true });
            } catch (err) {
              const message = err instanceof Error ? err.message : "Failed to process approval";
              return Response.json({ error: message }, { status: 500 });
            }
          }

          // API: Submit feedback with annotations
          if (url.pathname === "/api/feedback" && req.method === "POST") {
            try {
              const body = (await req.json()) as {
                feedback: string;
                annotations: unknown[];
                agentSwitch?: string;
                linkedDocs?: { viewed: string[]; requested: string[] };
              };

              // Build enhanced feedback with status envelope
              let enhancedFeedback = body.feedback || "";

              // Add linked docs section if any
              const linkedDocs = body.linkedDocs;
              if (linkedDocs && (linkedDocs.viewed.length > 0 || linkedDocs.requested.length > 0)) {
                enhancedFeedback += "\n\n---\n## Linked Documents\n";

                for (const path of linkedDocs.requested) {
                  enhancedFeedback += `- ${path} **(review requested)**\n`;
                }
                for (const path of linkedDocs.viewed) {
                  if (!linkedDocs.requested.includes(path)) {
                    enhancedFeedback += `- ${path} (viewed only)\n`;
                  }
                }

                if (linkedDocs.requested.length > 0) {
                  enhancedFeedback += "\nTo review requested documents, run:\n";
                  for (const path of linkedDocs.requested) {
                    enhancedFeedback += `\`/plannotator-doc ${path}\`\n`;
                  }
                }
              }

              // Add status envelope
              enhancedFeedback += `\n---\n**Status: CHANGES REQUESTED**\nAfter applying changes, re-run: \`/plannotator-doc ${filepath}\`\n`;

              resolveDecision({
                approved: false,
                feedback: enhancedFeedback,
                annotations: body.annotations || [],
                agentSwitch: body.agentSwitch,
              });

              return Response.json({ ok: true });
            } catch (err) {
              const message = err instanceof Error ? err.message : "Failed to process feedback";
              return Response.json({ error: message }, { status: 500 });
            }
          }

          // Serve embedded HTML for all other routes (SPA)
          return new Response(htmlContent, {
            headers: { "Content-Type": "text/html" },
          });
        },
      });

      break; // Success, exit retry loop
    } catch (err: unknown) {
      const isAddressInUse =
        err instanceof Error && err.message.includes("EADDRINUSE");

      if (isAddressInUse && attempt < MAX_RETRIES) {
        await Bun.sleep(RETRY_DELAY_MS);
        continue;
      }

      if (isAddressInUse) {
        const hint = isRemote ? " (set PLANNOTATOR_PORT to use different port)" : "";
        throw new Error(`Port ${configuredPort} in use after ${MAX_RETRIES} retries${hint}`);
      }

      throw err;
    }
  }

  if (!server) {
    throw new Error("Failed to start server");
  }

  const serverUrl = `http://localhost:${server.port}`;

  // Notify caller that server is ready
  if (onReady) {
    onReady(serverUrl, isRemote, server.port);
  }

  return {
    port: server.port,
    url: serverUrl,
    isRemote,
    waitForDecision: () => decisionPromise,
    stop: () => server.stop(),
  };
}

/**
 * Default behavior: open browser for local sessions
 */
export async function handleDocServerReady(
  url: string,
  isRemote: boolean,
  _port: number
): Promise<void> {
  if (!isRemote) {
    await openBrowser(url);
  }
}
