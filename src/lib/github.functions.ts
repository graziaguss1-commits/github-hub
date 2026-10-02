import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/github";

async function gh<T>(path: string): Promise<T> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const ghKey = process.env.GITHUB_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!ghKey) throw new Error("GITHUB_API_KEY is not configured");
  const res = await fetch(`${GATEWAY_URL}/${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": ghKey,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`GitHub request failed [${res.status}]: ${body}`);
    throw new Error(`GitHub request failed [${res.status}]: ${body}`);
  }
  return res.json() as Promise<T>;
}

export type GhUser = {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
};
export type GhRepo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
  owner: { login: string };
};
export type GhEvent = {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: Record<string, any>;
};
export type GhCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } };
};
export type GhIssue = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  pull_request?: unknown;
  user: { login: string };
};

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const user = await gh<GhUser>("user");
  const [repos, events] = await Promise.all([
    gh<GhRepo[]>("user/repos?sort=pushed&per_page=50&affiliation=owner,collaborator"),
    gh<GhEvent[]>(`users/${user.login}/events?per_page=40`),
  ]);
  return {
    user,
    repos: repos.map((r) => ({
      id: r.id, name: r.name, full_name: r.full_name, html_url: r.html_url,
      description: r.description, private: r.private, language: r.language,
      stargazers_count: r.stargazers_count, forks_count: r.forks_count,
      open_issues_count: r.open_issues_count, pushed_at: r.pushed_at, owner: { login: r.owner.login },
    })),
    events: events.map((e) => ({
      id: e.id, type: e.type, created_at: e.created_at, repo: { name: e.repo.name },
      payload: {
        action: e.payload?.action ?? null,
        ref: e.payload?.ref ?? null,
        size: e.payload?.size ?? e.payload?.commits?.length ?? null,
        title: e.payload?.pull_request?.title ?? e.payload?.issue?.title ?? null,
      },
    })),
  };
});

export const getRepoActivity = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/) }).parse(d))
  .handler(async ({ data }) => {
    const [commits, issues] = await Promise.all([
      gh<GhCommit[]>(`repos/${data.fullName}/commits?per_page=10`).catch(() => [] as GhCommit[]),
      gh<GhIssue[]>(`repos/${data.fullName}/issues?state=open&per_page=10`).catch(() => [] as GhIssue[]),
    ]);
    return {
      commits: commits.map((c) => ({
        sha: c.sha, html_url: c.html_url,
        message: c.commit.message.split("\n")[0],
        author: c.commit.author?.name ?? "—", date: c.commit.author?.date ?? "",
      })),
      issues: issues.map((i) => ({
        id: i.id, number: i.number, title: i.title, html_url: i.html_url,
        isPr: Boolean(i.pull_request), user: i.user.login, created_at: i.created_at,
      })),
    };
  });
