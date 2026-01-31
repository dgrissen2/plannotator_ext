/**
 * Security Utilities
 *
 * Path validation and sanitization for file operations.
 */

import { resolve, relative, isAbsolute, extname } from "path";

// Allowed image extensions
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
]);

/**
 * Validate that a requested path is within allowed base directories.
 * Prevents path traversal attacks.
 *
 * @param requestedPath The path requested by the client
 * @param allowedBases Array of allowed base directories
 * @returns The resolved absolute path if valid
 * @throws Error if path is outside allowed directories
 */
export function validatePath(
  requestedPath: string,
  allowedBases: string[]
): string {
  // Resolve to absolute path
  const resolved = resolve(requestedPath);

  // Check if resolved path starts with any allowed base
  const isAllowed = allowedBases.some((base) => {
    const resolvedBase = resolve(base);
    // Path must be within base (equal or subdirectory)
    return resolved === resolvedBase || resolved.startsWith(resolvedBase + "/");
  });

  if (!isAllowed) {
    throw new Error(`Path not allowed: ${requestedPath}`);
  }

  return resolved;
}

/**
 * Sanitize a filename by removing path separators and dangerous characters.
 * Useful for user-provided filenames.
 *
 * @param filename The filename to sanitize
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and parent directory references
  let sanitized = filename.replace(/[\/\\]/g, "").replace(/\.\./g, "");

  // Remove control characters and other potentially dangerous characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f<>:"|?*]/g, "");

  // Trim whitespace and dots from start/end
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, "");

  // If empty after sanitization, use a default
  if (!sanitized) {
    sanitized = "file";
  }

  return sanitized;
}

/**
 * Check if a file extension is an allowed image type.
 *
 * @param filename The filename to check
 * @returns true if the extension is allowed
 */
export function isAllowedImageExtension(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

/**
 * Validate an image path for serving.
 * Combines path validation with extension checking.
 *
 * @param imagePath The image path to validate
 * @param allowedBases Allowed base directories
 * @returns The validated absolute path
 * @throws Error if path is invalid or extension not allowed
 */
export function validateImagePath(
  imagePath: string,
  allowedBases: string[]
): string {
  const validated = validatePath(imagePath, allowedBases);

  if (!isAllowedImageExtension(validated)) {
    throw new Error(`Invalid image extension: ${extname(validated)}`);
  }

  return validated;
}
