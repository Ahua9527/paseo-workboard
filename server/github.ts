import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  githubInboxSchema,
  type Check,
  type GithubInbox,
  type GithubItem,
} from "../shared/github";
import type { Board } from "../shared/model";

const execute = promisify(execFile);
const options = { timeout: 20000, maxBuffer: 10 * 1024 * 1024 };
const query = `query($q: String!) {
  search(type: ISSUE, query: $q, first: 100) {
    issueCount
    nodes {
      __typename
      ... on Issue {
        number title url updatedAt
        repository { nameWithOwner }
        author { login }
        labels(first: 10) { nodes { name } }
      }
      ... on PullRequest {
        number title url updatedAt isDraft reviewDecision
        repository { nameWithOwner }
        author { login }
        labels(first: 10) { nodes { name } }
        commits(last: 1) {
          nodes { commit { statusCheckRollup {
            state
            contexts(first: 50) { nodes {
              __typename
              ... on CheckRun {
                name status conclusion detailsUrl
                checkSuite { workflowRun { workflow { name } } }
              }
              ... on StatusContext { context state targetUrl }
            } }
          } } }
        }
      }
    }
  }
}`;
const contextSchema = z.object({
  __typename: z.string(),
  name: z.string().optional(),
  context: z.string().optional(),
  status: z.string().optional(),
  conclusion: z.string().nullable().optional(),
  state: z.string().optional(),
  detailsUrl: z.string().nullable().optional(),
  targetUrl: z.string().nullable().optional(),
  checkSuite: z
    .object({
      workflowRun: z
        .object({ workflow: z.object({ name: z.string() }) })
        .nullable(),
    })
    .nullable()
    .optional(),
});
const responseSchema = z.object({
  data: z.object({
    search: z.object({
      issueCount: z.number(),
      nodes: z.array(
        z.object({
          __typename: z.enum(["Issue", "PullRequest"]),
          number: z.number(),
          title: z.string(),
          url: z.string(),
          updatedAt: z.string(),
          repository: z.object({ nameWithOwner: z.string() }),
          author: z.object({ login: z.string() }).nullable(),
          labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
          isDraft: z.boolean().optional(),
          reviewDecision: z.string().nullable().optional(),
          commits: z
            .object({
              nodes: z.array(
                z.object({
                  commit: z.object({
                    statusCheckRollup: z
                      .object({
                        state: z.string(),
                        contexts: z.object({ nodes: z.array(contextSchema) }),
                      })
                      .nullable(),
                  }),
                }),
              ),
            })
            .optional(),
        }),
      ),
    }),
  }),
});
function checkStatus(value: string | null | undefined): Check["status"] {
  switch (value) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
    case "TIMED_OUT":
    case "STARTUP_FAILURE":
    case "ACTION_REQUIRED":
      return "failure";
    case "CANCELLED":
      return "cancelled";
    case "SKIPPED":
    case "NEUTRAL":
    case "STALE":
      return "skipped";
    default:
      return "pending";
  }
}
function rollupStatus(value: string | undefined): GithubItem["checksStatus"] {
  if (value === undefined) return "none";
  if (value === "SUCCESS") return "success";
  if (value === "FAILURE" || value === "ERROR") return "failure";
  return "pending";
}
function statusContextStatus(value: string | undefined): Check["status"] {
  const status = rollupStatus(value);
  return status === "none" ? "pending" : status;
}
function failure(error: unknown): Pick<GithubInbox, "status" | "error"> {
  const details = error as { code?: string; stderr?: string; killed?: boolean };
  if (details?.code === "ENOENT")
    return { status: "gh-missing", error: "GitHub CLI (gh) is not installed" };
  if (/gh auth login|HTTP\s+401/i.test(details?.stderr ?? ""))
    return { status: "unauthenticated", error: "Sign in with gh auth login" };
  return {
    status: "error",
    error: details?.killed ? "GitHub query timed out" : "GitHub query failed",
  };
}

export class GitHubInbox {
  private result: GithubInbox = {
    status: "ok",
    fetchedAt: null,
    error: null,
    truncated: false,
    items: [],
  };
  private requestedAt: number | null = null;
  private inFlight: Promise<GithubInbox> | undefined;
  private remotes = new Map<string, Promise<string[]>>();

  async read(
    projects: Board["projects"],
    refresh: boolean,
  ): Promise<GithubInbox> {
    const now = Date.now();
    if (this.inFlight) await this.inFlight;
    else if (
      !(this.requestedAt !== null && now - this.requestedAt < 10000) &&
      !(
        this.result.status === "ok" &&
        this.result.fetchedAt &&
        !refresh &&
        now - Date.parse(this.result.fetchedAt) < 60000
      )
    ) {
      this.requestedAt = now;
      this.inFlight = this.fetch();
      try {
        await this.inFlight;
      } finally {
        this.inFlight = undefined;
      }
    }
    const result = this.result;
    const matches = new Map<string, Set<string>>();
    await Promise.all(
      projects
        .filter((project) => project.isGit)
        .map(async (project) => {
          for (const repo of await this.repositories(project.directory)) {
            const ids = matches.get(repo) ?? new Set<string>();
            ids.add(project.id);
            matches.set(repo, ids);
          }
        }),
    );
    return {
      ...result,
      items: result.items.map((item) => {
        const ids = matches.get(item.repo.toLowerCase());
        return { ...item, projectId: ids?.size === 1 ? [...ids][0] : null };
      }),
    };
  }

  private async fetch(): Promise<GithubInbox> {
    try {
      const { stdout } = await execute(
        "gh",
        [
          "api",
          "graphql",
          "-f",
          `query=${query}`,
          "-F",
          "q=is:open user:@me archived:false sort:updated-desc",
        ],
        options,
      );
      const { search } = responseSchema.parse(JSON.parse(stdout)).data;
      const items: GithubItem[] = search.nodes.map((node) => {
        const pr = node.__typename === "PullRequest";
        const rollup = pr
          ? node.commits?.nodes[0]?.commit.statusCheckRollup
          : null;
        const checks: Check[] = (rollup?.contexts.nodes ?? []).map(
          (context) => ({
            name: context.name ?? context.context ?? "Check",
            status:
              context.__typename === "CheckRun"
                ? context.status === "COMPLETED"
                  ? checkStatus(context.conclusion)
                  : "pending"
                : context.__typename === "StatusContext"
                  ? statusContextStatus(context.state)
                  : "pending",
            url: context.detailsUrl ?? context.targetUrl ?? null,
            ...(context.checkSuite?.workflowRun?.workflow.name
              ? { workflow: context.checkSuite.workflowRun.workflow.name }
              : {}),
          }),
        );
        return {
          kind: pr ? "pr" : "issue",
          repo: node.repository.nameWithOwner,
          number: node.number,
          title: node.title,
          url: node.url,
          updatedAt: node.updatedAt,
          author: node.author?.login ?? null,
          labels: node.labels.nodes.map((label) => label.name),
          isDraft: pr && (node.isDraft ?? false),
          reviewDecision: !pr
            ? null
            : node.reviewDecision === "APPROVED"
              ? "approved"
              : node.reviewDecision === "CHANGES_REQUESTED"
                ? "changes_requested"
                : node.reviewDecision === "REVIEW_REQUIRED"
                  ? "pending"
                  : null,
          checksStatus: rollupStatus(rollup?.state),
          checks,
          projectId: null,
        };
      });
      this.result = githubInboxSchema.parse({
        status: "ok",
        fetchedAt: new Date().toISOString(),
        error: null,
        truncated: search.issueCount > items.length,
        items,
      });
    } catch (error) {
      this.result = { ...this.result, ...failure(error) };
    }
    return this.result;
  }

  private repositories(directory: string): Promise<string[]> {
    let result = this.remotes.get(directory);
    if (!result) {
      result = execute("git", ["-C", directory, "remote", "-v"], options)
        .then(({ stdout }) => {
          const repos = new Set<string>();
          for (const line of stdout.split("\n")) {
            const remote = line.trim().split(/\s+/)[1];
            const match = remote?.match(
              /^(?:https?:\/\/github\.com\/|(?:ssh:\/\/)?git@github\.com[:/])([^/\s]+\/[^/\s]+?)\/?$/i,
            );
            if (match) repos.add(match[1].replace(/\.git$/i, "").toLowerCase());
          }
          return [...repos];
        })
        .catch(() => []);
      this.remotes.set(directory, result);
    }
    return result;
  }
}
