import { alphaPieces } from "./pieces/alpha.ts";
import { cburnettPieces } from "./pieces/cburnett.ts";
import { leipzigPieces } from "./pieces/leipzig.ts";
import { maestroPieces } from "./pieces/maestro.ts";
import { meridaPieces } from "./pieces/merida.ts";
import { spatialPieces } from "./pieces/spatial.ts";

export type PieceSetId =
  | "merida"
  | "alpha"
  | "leipzig"
  | "maestro"
  | "cburnett"
  | "spatial";

export interface PieceSetMeta {
  id: PieceSetId;
  name: string;
  nameVi: string;
  description: string;
}

export const PIECE_SETS_META: Record<PieceSetId, PieceSetMeta> = {
  merida: {
    id: "merida",
    name: "Merida",
    nameVi: "Merida (Chuẩn giáo khoa / Sách báo)",
    description:
      "Bộ quân kinh điển trong sách cờ quốc tế, ChessBase, Informant",
  },
  alpha: {
    id: "alpha",
    name: "Alpha",
    nameVi: "Alpha (Sách cờ châu Âu)",
    description: "Phong cách diagram kinh điển của Eric Bentzen",
  },
  leipzig: {
    id: "leipzig",
    name: "Leipzig",
    nameVi: "Leipzig (Truyền thống Đức)",
    description: "Phong cách diagram cổ điển Đức của Hernandez Marroquin",
  },
  maestro: {
    id: "maestro",
    name: "Maestro",
    nameVi: "Maestro (Tạp chí FIDE / Informator)",
    description: "Phong cách cờ diagram tạp chí FIDE",
  },
  cburnett: {
    id: "cburnett",
    name: "Staunton Modern",
    nameVi: "Staunton Hiện đại (Cburnett)",
    description:
      "Bộ quân Staunton vector hiện đại quen thuộc trên Lichess / Wikipedia",
  },
  spatial: {
    id: "spatial",
    name: "Newspaper B&W",
    nameVi: "Báo in / Đơn sắc (Spatial)",
    description: "Tối ưu cho in ấn laser, photocopy, sách báo đen trắng",
  },
};

export const PIECE_SETS: Record<PieceSetId, Record<string, string>> = {
  merida: meridaPieces,
  alpha: alphaPieces,
  leipzig: leipzigPieces,
  maestro: maestroPieces,
  cburnett: cburnettPieces,
  spatial: spatialPieces,
};

export const DEFAULT_PIECE_SET: PieceSetId = "merida";

export function getPieceSet(name?: string): Record<string, string> {
  if (!name) return PIECE_SETS[DEFAULT_PIECE_SET];
  const normalized = name.toLowerCase().trim() as PieceSetId;
  return PIECE_SETS[normalized] || PIECE_SETS[DEFAULT_PIECE_SET];
}

/**
 * Full piece-set data for embedding into a widget's client-side `<script>`
 * (the interactive theme picker running in the iframe needs every set, not
 * just the currently-selected one, so it can switch without another
 * syscall round-trip) — exposed as `chess.themes.getAllPieceSets`.
 */
export function getAllPieceSets(): {
  sets: Record<PieceSetId, Record<string, string>>;
  meta: Record<PieceSetId, PieceSetMeta>;
  default: PieceSetId;
} {
  return { sets: PIECE_SETS, meta: PIECE_SETS_META, default: DEFAULT_PIECE_SET };
}
