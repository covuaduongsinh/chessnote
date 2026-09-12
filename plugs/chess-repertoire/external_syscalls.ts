// Local mirror of the thin plug_api.ts wrappers chess-repertoire calls into
// on chess-core (chess.*) and chess-db (chessSql.*) — duplicated here
// (rather than importing ../chess/plug_api.ts, ../chess-db/plug_api.ts
// directly) so chess-repertoire builds standalone once split into its own
// repo: the syscall names below are just strings, resolved at runtime
// against whichever installed plug backs them.
import { syscall } from "@silverbulletmd/silverbullet/syscall";
import {
  type ParseTree,
  renderToText,
} from "@silverbulletmd/silverbullet/lib/tree";

// See plugs/chess/external_syscalls.ts's extractFrontMatter doc comment for
// why this goes through the documented `index.extractFrontmatter` syscall
// instead of importing plugs/index/frontmatter.ts directly.
export type FrontMatter = { tags?: string[] } & Record<string, any>;

export async function extractFrontMatter(tree: ParseTree): Promise<FrontMatter> {
  const { frontmatter } = await syscall(
    "index.extractFrontmatter",
    renderToText(tree),
  );
  return frontmatter;
}

export function isRepertoirePage(frontmatter: FrontMatter): Promise<boolean> {
  return syscall("chess.isRepertoirePage", frontmatter);
}

export interface RepertoireLineUpsert {
  ref: string;
  page: string;
  side: string;
  eco: string;
  openingName: string;
  variationName: string;
  movesSan: string;
}

export function syncRepertoireLinesForPage(
  page: string,
  lines: RepertoireLineUpsert[],
): Promise<void> {
  return syscall("chessSql.syncRepertoireLinesForPage", page, lines);
}

export type SrsGrade = "again" | "hard" | "good" | "easy";

export interface RepertoireLineRow {
  ref: string;
  page: string;
  side: string;
  eco: string;
  openingName: string;
  variationName: string;
  movesSan: string;
  dueDate: string | null;
  easeFactor: number;
  intervalDays: number;
  reviewCount: number;
  lastGrade: string | null;
}

export function getDueRepertoireLines(
  limit: number,
): Promise<RepertoireLineRow[]> {
  return syscall("chessSql.getDueRepertoireLines", limit);
}

export function recordRepertoireReview(
  ref: string,
  grade: SrsGrade,
): Promise<RepertoireLineRow | null> {
  return syscall("chessSql.recordRepertoireReview", ref, grade);
}
