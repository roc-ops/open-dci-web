/**
 * Remote config loader — fetches config content from external sources.
 *
 * Supports three source types:
 *   - GitHub repo file: fetches from the open-dci repo on GitHub
 *   - GitHub Gist: fetches from the GitHub Gist API (public, no auth)
 *   - Arbitrary URL: fetches raw content from any URL
 */

/** Base URL for raw file access in the open-dci GitHub repo. */
const REPO_RAW_BASE =
  "https://raw.githubusercontent.com/roc-ops/open-dci/main";

/** GitHub Gist API base URL. */
const GIST_API_BASE = "https://api.github.com/gists";

/**
 * Fetch a file from the roc-ops/open-dci GitHub repository.
 *
 * @param path - Repo-relative path, e.g. "docs/examples/basic-cm.jsonc"
 * @returns The file content as a string.
 */
export async function fetchFromRepo(path: string): Promise<string> {
  const cleanPath = path.replace(/^\/+/, "");
  const url = `${REPO_RAW_BASE}/${cleanPath}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch file from repo: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

/**
 * Fetch the first file from a public GitHub Gist.
 *
 * @param gistId - The Gist ID (hex string), e.g. "abc123def456"
 * @returns An object with the file content and its filename.
 */
export async function fetchFromGist(
  gistId: string,
): Promise<{ content: string; filename: string }> {
  const url = `${GIST_API_BASE}/${gistId}`;

  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Gist: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    files: Record<string, { filename: string; content: string }>;
  };

  const files = Object.values(data.files);
  if (files.length === 0) {
    throw new Error("The Gist contains no files.");
  }

  const file = files[0];
  return { content: file.content, filename: file.filename };
}

/**
 * Fetch raw content from an arbitrary URL.
 *
 * @param url - A fully-qualified URL to fetch (e.g. a raw GitHub URL).
 * @returns The response body as a string.
 */
export async function fetchFromUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch URL: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

/**
 * Fetch a MIB bundle (JSON object mapping filename → SMIv2 content) from
 * a Gist ID or a URL.
 *
 * - If `ref` looks like a hex Gist ID, fetches via the Gist API and parses
 *   the first file's content as JSON.
 * - Otherwise treats `ref` as a URL and fetches + parses directly.
 */
export async function fetchMibBundle(
  ref: string,
): Promise<Record<string, string>> {
  let raw: string;
  if (/^[a-f0-9]+$/i.test(ref)) {
    const { content } = await fetchFromGist(ref);
    raw = content;
  } else {
    raw = await fetchFromUrl(ref);
  }
  return JSON.parse(raw) as Record<string, string>;
}

/**
 * Fetch vendor schema file(s) from a Gist ID or URL.
 *
 * - If `ref` is a hex Gist ID, fetches all files from the Gist (each file
 *   is treated as a separate vendor schema).
 * - Otherwise treats `ref` as a URL pointing to a single vendor schema file.
 *
 * Returns a map of filename → JSON content string.
 */
export async function fetchVendorSchemas(
  ref: string,
): Promise<Record<string, string>> {
  if (/^[a-f0-9]+$/i.test(ref)) {
    const url = `${GIST_API_BASE}/${ref}`;
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Gist: ${response.status} ${response.statusText}`,
      );
    }
    const data = (await response.json()) as {
      files: Record<string, { filename: string; content: string }>;
    };
    const result: Record<string, string> = {};
    for (const file of Object.values(data.files)) {
      result[file.filename] = file.content;
    }
    if (Object.keys(result).length === 0) {
      throw new Error("The Gist contains no files.");
    }
    return result;
  }

  const content = await fetchFromUrl(ref);
  return { [filenameFromUrl(ref)]: content };
}

/**
 * Extract a filename from a URL path.
 * Returns the last path segment, or a fallback if none can be derived.
 */
export function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1];
    }
  } catch {
    // Invalid URL — fall through to default
  }
  return "remote.jsonc";
}

/**
 * Extract a filename from a repo-relative path.
 * Returns the last path segment, or a fallback if none can be derived.
 */
export function filenameFromPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length > 0) {
    return segments[segments.length - 1];
  }
  return "remote.jsonc";
}
