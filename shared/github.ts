import { z } from "zod";

/** One CI check, shared by workspace cards and the GitHub page. Unknown forge states map to pending. */
export const checkSchema = z.object({
  name: z.string(),
  status: z.enum(["success", "failure", "pending", "skipped", "cancelled"]),
  url: z.string().nullable(),
  workflow: z.string().optional(),
  duration: z.string().optional(),
});
export type Check = z.infer<typeof checkSchema>;

export const githubItemSchema = z.object({
  kind: z.enum(["issue", "pr"]),
  /** owner/name */
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  isDraft: z.boolean(),
  author: z.string().nullable(),
  labels: z.array(z.string()),
  updatedAt: z.string(),
  reviewDecision: z
    .enum(["approved", "changes_requested", "pending"])
    .nullable(),
  checksStatus: z.enum(["none", "pending", "success", "failure"]),
  checks: z.array(checkSchema),
  /** The single Paseo project whose GitHub remote is this repo; null when none or ambiguous. */
  projectId: z.string().nullable(),
});
export type GithubItem = z.infer<typeof githubItemSchema>;

/**
 * Read-only open issues and PRs in the viewer's own repositories, fetched through the host's gh
 * login. Items survive a failed refresh so the page keeps showing the last good result.
 */
export const githubInboxSchema = z.object({
  status: z.enum(["ok", "gh-missing", "unauthenticated", "error"]),
  fetchedAt: z.string().nullable(),
  error: z.string().nullable(),
  /** More results exist than were fetched. */
  truncated: z.boolean(),
  items: z.array(githubItemSchema),
});
export type GithubInbox = z.infer<typeof githubInboxSchema>;
