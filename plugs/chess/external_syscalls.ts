// Local mirror of the thin plug_api.ts wrappers chess-core calls into on
// chess-db (chessSql.*), chess-engine (chess.engine.buildMoveList), and
// chess-themes (chess.themes.*) — duplicated here (rather than importing
// ../chess-db/plug_api.ts, ../chess-engine/plug_api.ts,
// ../chess-themes/plug_api.ts directly) so chess-core builds standalone once
// split into its own repo: the syscall names below are just strings,
// resolved at runtime against whichever installed plug backs them.
//
// Also wraps the STANDARD (upstream, non-chess) `index` plug's documented
// `index.extractFrontmatter` syscall (see plugs/index/index.plug.yaml,
// "see: API/index") instead of importing plugs/index/frontmatter.ts's
// tree-based implementation directly — that file is index's own internal
// detail (not part of the public @silverbulletmd/silverbullet/* SDK), so
// even though `index` ships with every SilverBullet install, its source
// isn't reachable from a separately-repo'd plug. The syscall takes raw text,
// not a tree, so this re-serializes the already-parsed tree via
// `renderToText` — a small redundant re-parse inside the syscall, traded for
// genuine standalone-installability.
import { syscall } from "@silverbulletmd/silverbullet/syscall";
import {
  type ParseTree,
  renderToText,
} from "@silverbulletmd/silverbullet/lib/tree";

// ---- index (standard, non-chess plug — index.extractFrontmatter) ----

export type FrontMatter = { tags?: string[] } & Record<string, any>;

export interface FrontMatterExtractOptions {
  removeKeys?: string[];
  removeTags?: string[] | boolean;
  removeTagsPrefix?: string[];
  removeFrontMatterSection?: boolean;
}

export async function extractFrontMatter(
  tree: ParseTree,
  options: FrontMatterExtractOptions = {},
): Promise<FrontMatter> {
  const { frontmatter } = await syscall(
    "index.extractFrontmatter",
    renderToText(tree),
    options,
  );
  return frontmatter;
}

// ---- chess-engine (chess.engine.buildMoveList) ----

export interface MoveListEntry {
  moveNum: number;
  isWhite: boolean;
  san: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
}

export function buildMoveList(pgn: string): Promise<MoveListEntry[]> {
  return syscall("chess.engine.buildMoveList", pgn);
}

// ---- chess-themes (chess.themes.*) ----

export function getPieceSet(name?: string): Promise<Record<string, string>> {
  return syscall("chess.themes.getPieceSet", name);
}

export function getAllPieceSets(): Promise<{
  sets: Record<string, Record<string, string>>;
  meta: Record<string, unknown>;
  default: string;
}> {
  return syscall("chess.themes.getAllPieceSets");
}

export interface BoardTheme {
  id: string;
  name: string;
  nameVi: string;
  light: string;
  dark: string;
  border: string;
  select: string;
  highlight: string;
  dest: string;
  coordLight: string;
  coordDark: string;
}

export function getBoardTheme(themeId?: string): Promise<BoardTheme> {
  return syscall("chess.themes.getBoardTheme", themeId);
}

export function getAllBoardThemes(): Promise<{
  themes: Record<string, BoardTheme>;
  default: string;
}> {
  return syscall("chess.themes.getAllBoardThemes");
}

export function generateBoardThemeCss(theme: BoardTheme): Promise<string> {
  return syscall("chess.themes.generateBoardThemeCss", theme);
}

// ---- chess-db (chessSql.*) ----

export interface ChessSqlGameRow {
  ref: string;
  page: string;
  white: string;
  black: string;
  result: string;
  dateRaw: string;
  eco: string;
  event: string;
  summary: string;
  whiteEloRaw: string;
  blackEloRaw: string;
  timeControl: string;
  opening: string;
  variation: string;
  searchBlob: string;
}

export function upsertGames(games: ChessSqlGameRow[]): Promise<void> {
  return syscall("chessSql.upsertGames", games);
}

export function deleteGamesForPage(page: string): Promise<void> {
  return syscall("chessSql.deleteGamesForPage", page);
}

export interface AiAnnotationFrontmatterSync {
  ref: string;
  page: string;
  summary: string;
  tags: string[];
}

export function syncAiAnnotationFromFrontmatter(
  sync: AiAnnotationFrontmatterSync,
): Promise<void> {
  return syscall("chessSql.syncAiAnnotationFromFrontmatter", sync);
}

export function deleteAiAnnotationsForPage(page: string): Promise<void> {
  return syscall("chessSql.deleteAiAnnotationsForPage", page);
}

export function deleteRepertoireLinesForPage(page: string): Promise<void> {
  return syscall("chessSql.deleteRepertoireLinesForPage", page);
}

export function deleteEmbeddingsForPage(page: string): Promise<void> {
  return syscall("chessSql.deleteEmbeddingsForPage", page);
}

export interface RelatedGamesQuery {
  page: string;
  white: string | null;
  black: string | null;
  eco: string;
  limit: number;
}

export interface RelatedGameCandidateRow {
  page: string;
  white: string;
  black: string;
  result: string;
  eco: string;
  score: number;
}

export function queryRelatedGames(
  query: RelatedGamesQuery,
): Promise<RelatedGameCandidateRow[]> {
  return syscall("chessSql.queryRelatedGames", query);
}
