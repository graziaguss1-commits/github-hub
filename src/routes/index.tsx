import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDashboard, getRepoActivity } from "@/lib/github.functions";

const dashboardQuery = queryOptions({
  queryKey: ["github", "dashboard"],
  queryFn: () => getDashboard(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel GitHub — Repositórios e atividades" },
      { name: "description", content: "Acompanhe seus repositórios, commits, issues e atividades recentes do GitHub em um só lugar." },
      { property: "og:title", content: "Painel GitHub — Repositórios e atividades" },
      { property: "og:description", content: "Acompanhe seus repositórios e atividades recentes do GitHub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-10">
      <h1 className="text-xl font-semibold">Não foi possível carregar o GitHub</h1>
      <p className="mt-2 font-mono text-sm text-muted-foreground break-words">{error.message}</p>
    </div>
  ),
});

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const EVENT_LABEL: Record<string, string> = {
  PushEvent: "push",
  PullRequestEvent: "pull request",
  IssuesEvent: "issue",
  IssueCommentEvent: "comentário",
  CreateEvent: "criou",
  DeleteEvent: "removeu",
  WatchEvent: "estrela",
  ForkEvent: "fork",
  ReleaseEvent: "release",
  PullRequestReviewEvent: "review",
};

function Dashboard() {
  const { data } = useSuspenseQuery(dashboardQuery);
  const { user, repos, events } = data;
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(repos[0]?.full_name ?? null);

  const filtered = useMemo(
    () => repos.filter((r) => r.full_name.toLowerCase().includes(filter.toLowerCase())),
    [repos, filter],
  );
  const totals = useMemo(
    () => ({
      stars: repos.reduce((a, r) => a + r.stargazers_count, 0),
      issues: repos.reduce((a, r) => a + r.open_issues_count, 0),
      week: events.filter((e) => Date.now() - new Date(e.created_at).getTime() < 7 * 86400e3).length,
    }),
    [repos, events],
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-5">
          <img src={user.avatar_url} alt="" className="h-12 w-12 rounded-full border border-border" />
          <div className="min-w-0">
            <p className="font-mono text-xs text-primary">~/github/{user.login}</p>
            <h1 className="truncate text-2xl font-semibold">{user.name ?? user.login}</h1>
          </div>
          <a href={user.html_url} target="_blank" rel="noreferrer" className="ml-auto rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
            Abrir perfil ↗
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Repositórios", repos.length],
            ["Estrelas", totals.stars],
            ["Issues abertas", totals.issues],
            ["Eventos (7 dias)", totals.week],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="mt-1 font-mono text-3xl font-semibold text-primary">{value}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr_1fr]">
          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-3">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar repositórios…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <ul className="max-h-[640px] overflow-y-auto">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r.full_name)}
                    className={`w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-secondary ${selected === r.full_name ? "bg-secondary" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm font-semibold">{r.name}</span>
                      {r.private && <span className="rounded border border-accent px-1.5 text-[10px] text-accent">privado</span>}
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{timeAgo(r.pushed_at)}</span>
                    </div>
                    {r.description && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{r.description}</p>}
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {r.language ?? "—"} · ★ {r.stargazers_count} · ⑂ {r.forks_count} · ● {r.open_issues_count}
                    </p>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nenhum repositório.</li>}
            </ul>
          </section>

          <section className="rounded-lg border border-border bg-card">
            {selected ? <RepoPanel fullName={selected} /> : <p className="p-4 text-sm text-muted-foreground">Selecione um repositório.</p>}
          </section>

          <section className="rounded-lg border border-border bg-card">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Atividade recente</h2>
            <ol className="max-h-[640px] overflow-y-auto">
              {events.map((e) => (
                <li key={e.id} className="border-b border-border px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-primary">{EVENT_LABEL[e.type] ?? e.type.replace("Event", "")}</span>
                    {e.payload.action && <span className="text-xs text-muted-foreground">{e.payload.action}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{timeAgo(e.created_at)}</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs">{e.repo.name}</p>
                  {e.payload.title && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{e.payload.title}</p>}
                  {e.type === "PushEvent" && e.payload.ref && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{String(e.payload.ref).replace("refs/heads/", "")}{e.payload.size ? ` · ${e.payload.size} commit(s)` : ""}</p>
                  )}
                </li>
              ))}
              {events.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sem atividade recente.</li>}
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}

function RepoPanel({ fullName }: { fullName: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["github", "repo", fullName],
    queryFn: () => getRepoActivity({ data: { fullName } }),
    staleTime: 60_000,
  });
  return (
    <div>
      <div className="flex items-center border-b border-border px-4 py-3">
        <h2 className="truncate font-mono text-sm font-semibold">{fullName}</h2>
        <a href={`https://github.com/${fullName}`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-primary hover:underline">GitHub ↗</a>
      </div>
      {isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="p-4 text-sm text-destructive">{(error as Error).message}</p>}
      {data && (
        <div className="max-h-[600px] overflow-y-auto">
          <h3 className="px-4 pt-4 text-xs uppercase tracking-wider text-muted-foreground">Últimos commits</h3>
          <ul className="mt-2">
            {data.commits.map((c) => (
              <li key={c.sha} className="px-4 py-2 text-sm">
                <a href={c.html_url} target="_blank" rel="noreferrer" className="hover:text-primary">
                  <span className="mr-2 font-mono text-xs text-accent">{c.sha.slice(0, 7)}</span>
                  {c.message}
                </a>
                <p className="text-xs text-muted-foreground">{c.author} · {c.date && timeAgo(c.date)}</p>
              </li>
            ))}
            {data.commits.length === 0 && <li className="px-4 py-2 text-sm text-muted-foreground">Sem commits.</li>}
          </ul>
          <h3 className="px-4 pt-4 text-xs uppercase tracking-wider text-muted-foreground">Issues e PRs abertos</h3>
          <ul className="mt-2 pb-3">
            {data.issues.map((i) => (
              <li key={i.id} className="px-4 py-2 text-sm">
                <a href={i.html_url} target="_blank" rel="noreferrer" className="hover:text-primary">
                  <span className="mr-2 font-mono text-xs text-primary">{i.isPr ? "PR" : "#"}{i.number}</span>
                  {i.title}
                </a>
                <p className="text-xs text-muted-foreground">{i.user} · {timeAgo(i.created_at)}</p>
              </li>
            ))}
            {data.issues.length === 0 && <li className="px-4 py-2 text-sm text-muted-foreground">Nada em aberto.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
