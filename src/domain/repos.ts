/**
 * A repository as people actually paste it: "owner/name", a github.com URL
 * (with or without a pull request on the end), or an SSH remote. All of them
 * come out as "owner/name"; anything else comes out as null.
 */
export function parseRepo(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^git@github\.com:/i, "")
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "");
  const match = cleaned.match(/^([\w.-]+)\/([\w.-]+)(?:\/.*)?$/);
  if (!match) return null;
  return `${match[1]}/${match[2].replace(/\.git$/i, "")}`;
}

/**
 * A comma- or space-separated field of repositories, as the project sheet
 * takes them. `bad` holds whatever couldn't be read, so the sheet can say so.
 */
export function parseRepos(text: string): { repos: string[]; bad: string[] } {
  const repos: string[] = [];
  const bad: string[] = [];
  for (const part of text.split(/[\s,]+/).filter(Boolean)) {
    const repo = parseRepo(part);
    if (!repo) bad.push(part);
    else if (!repos.some((r) => r.toLowerCase() === repo.toLowerCase())) repos.push(repo);
  }
  return { repos, bad };
}
