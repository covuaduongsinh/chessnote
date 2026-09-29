#!/usr/bin/env python3
"""Sinh docs/modules/TRA-CUU-TU-DONG.md từ mã nguồn (không chép tay).

Chạy:  python scripts/gen_module_reference.py
Đọc:   plugs/*/*.plug.yaml, plugs/**/*.ts (config.define), cloud-server/, ai-sidecar/
Ghi:   docs/modules/TRA-CUU-TU-DONG.md

Chỉ dùng thư viện chuẩn (không cần PyYAML) — trích bằng regex theo đúng khuôn
các file *.plug.yaml của repo (mỗi function là một khối thụt lề 2 dấu cách).
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "docs", "modules", "TRA-CUU-TU-DONG.md")

CHESS_PLUGS = [
    "chess", "chess-themes", "chess-engine", "chess-db",
    "chess-pdf-export", "chess-repertoire", "chess-ai",
]


def read(path):
    with io.open(path, encoding="utf-8") as f:
        return f.read()


def count_lines(path):
    """Giống `wc -l`: đếm ký tự xuống dòng (không lấy số dòng từ tool Read)."""
    with io.open(path, "rb") as f:
        return f.read().count(b"\n")


def rel(path):
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def walk(dirpath, exts, skip=("node_modules", "target", ".omc", "wasm")):
    for base, dirs, files in os.walk(dirpath):
        dirs[:] = [d for d in dirs if d not in skip]
        for fn in sorted(files):
            if fn.endswith(exts):
                yield os.path.join(base, fn)


def parse_plug_yaml(path):
    """Trả về danh sách function: {name, path, events, command, syscall, widget}."""
    text = read(path)
    funcs = []
    cur = None
    in_events = False
    for line in text.splitlines():
        m = re.match(r"^  ([A-Za-z0-9_]+):\s*$", line)
        if m:
            cur = {"name": m.group(1), "path": "", "events": [], "command": "",
                   "syscall": "", "widget": ""}
            funcs.append(cur)
            in_events = False
            continue
        if cur is None:
            continue
        m = re.match(r"^    path:\s*(.+?)\s*$", line)
        if m:
            cur["path"] = m.group(1).strip("\"'")
            in_events = False
            continue
        if re.match(r"^    events:\s*$", line):
            in_events = True
            continue
        if in_events:
            m = re.match(r"^      - (.+?)\s*$", line)
            if m:
                cur["events"].append(m.group(1))
                continue
            in_events = False
        m = re.match(r"^    codeWidget:\s*(\S+)", line)
        if m:
            cur["widget"] = m.group(1)
        m = re.match(r"^      name:\s*(.+?)\s*$", line)
        if m:
            # `name:` thụt lề 6 nằm dưới `command:` hoặc `syscall:` — xác định theo khối cha.
            nm = m.group(1).strip("\"'")
            cur.setdefault("_last_name", nm)
        if re.match(r"^    command:\s*$", line):
            cur["_block"] = "command"
        if re.match(r"^    syscall:\s*$", line):
            cur["_block"] = "syscall"
        if line.startswith("      name:") and cur.get("_block"):
            nm = line.split(":", 1)[1].strip().strip("\"'")
            cur[cur["_block"]] = nm
    return funcs


def md_table(header, rows):
    out = ["| " + " | ".join(header) + " |", "|" + "|".join(["---"] * len(header)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(c).replace("|", "\\|") for c in r) + " |")
    return "\n".join(out)


def git(*args):
    try:
        return subprocess.check_output(["git", "-C", ROOT] + list(args)).decode("utf-8").strip()
    except Exception:
        return ""


HISTORY_OUT = os.path.join(ROOT, "docs", "modules", "LICH-SU-COMMIT.md")
HISTORY_SINCE = "2026-09-06"  # ngày bắt đầu các giai đoạn ChessNote (trước đó là lịch sử SilverBullet)


def gen_history():
    """Sinh docs/modules/LICH-SU-COMMIT.md: commit từ HISTORY_SINCE, gom theo ngày."""
    raw = git("log", "--since=" + HISTORY_SINCE, "--no-merges", "--reverse",
              "--format=%cs|%h|%s")
    rows = [l.split("|", 2) for l in raw.splitlines() if l.count("|") >= 2]
    commit = git("rev-parse", "--short=10", "HEAD")
    out = [
        "# Lịch sử commit theo ngày (sinh từ git log)\n",
        "> **Không sửa tay.** Sinh bằng `python scripts/gen_module_reference.py` "
        "tại commit `" + commit + "`. Chỉ liệt kê commit từ **" + HISTORY_SINCE + "** "
        "(các giai đoạn ChessNote); lịch sử trước đó là của SilverBullet gốc. "
        "Tổng: **" + str(len(rows)) + "** commit.\n",
    ]
    cur = None
    for date, h, subj in rows:
        if date != cur:
            out.append("\n## " + date + "\n")
            cur = date
        out.append("- `" + h + "` " + subj)
    io.open(HISTORY_OUT, "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")


def main():
    gen_history()
    parts = []
    commit = git("rev-parse", "--short=10", "HEAD")
    date = git("log", "-1", "--format=%cs")
    parts.append("# Bảng tra cứu tự động (sinh từ mã nguồn)\n")
    parts.append(
        f"> **Không sửa tay file này.** Sinh bằng `python scripts/gen_module_reference.py` "
        f"từ mã nguồn tại commit `{commit}` ({date}). Muốn cập nhật: chạy lại script rồi commit.\n"
    )

    # 1. Quy mô từng plug
    rows = []
    total_src = total_test = total_cases = 0
    for p in CHESS_PLUGS:
        d = os.path.join(ROOT, "plugs", p)
        src = tests = files = cases = 0
        for f in walk(d, (".ts",)):
            n = count_lines(f)
            files += 1
            if f.endswith(".test.ts"):
                tests += n
                cases += len(re.findall(r"^\s*(?:it|test)\(", read(f), re.M))
            else:
                src += n
        total_src += src
        total_test += tests
        rows.append([f"`plugs/{p}/`", files, f"{src:,}".replace(",", "."), f"{tests:,}".replace(",", "."), cases])
        total_cases += cases
    parts.append("## 1. Quy mô các plug cờ vua\n")
    parts.append(md_table(["Plug", "Số file .ts", "Dòng mã (không test)", "Dòng test", "Số test case"], rows))
    parts.append(f"\nTổng: **{total_src:,}** dòng mã và **{total_test:,}** dòng test ({total_cases} test case) — cộng lại từ bảng trên.\n".replace(",", "."))

    # 2. Lệnh (command)
    cmd_rows, sys_rows, ev_rows, wid_rows = [], [], [], []
    for p in CHESS_PLUGS + ["sync"]:
        y = os.path.join(ROOT, "plugs", p, f"{p}.plug.yaml")
        if not os.path.exists(y):
            continue
        for fn in parse_plug_yaml(y):
            file_fn = fn["path"].lstrip("./")
            if fn["command"]:
                cmd_rows.append([f"`{fn['command']}`", f"`{p}`", f"`{file_fn}`"])
            if fn["syscall"]:
                sys_rows.append([f"`{fn['syscall']}`", f"`{p}`", f"`{file_fn}`"])
            for e in fn["events"]:
                ev_rows.append([f"`{e}`", f"`{p}`", f"`{file_fn}`"])
            if fn["widget"]:
                wid_rows.append([f"` ```{fn['widget']} `", f"`{p}`", f"`{file_fn}`"])
    parts.append("## 2. Code widget (khối mã được vẽ thành giao diện)\n")
    parts.append(md_table(["Khối", "Plug", "Hàm"], wid_rows))
    parts.append("\n## 3. Lệnh trong Command Palette\n")
    parts.append(md_table(["Lệnh", "Plug", "Hàm xử lý"], cmd_rows))
    parts.append(f"\nTổng: {len(cmd_rows)} lệnh.\n")
    parts.append("## 4. Syscall các plug cung cấp (gọi xuyên plug)\n")
    parts.append(md_table(["Syscall", "Plug cung cấp", "Hàm"], sys_rows))
    parts.append(f"\nTổng: {len(sys_rows)} syscall.\n")
    parts.append("## 5. Sự kiện (event) plug đăng ký lắng nghe\n")
    parts.append(md_table(["Sự kiện", "Plug", "Hàm"], ev_rows))

    # 6. Khóa cấu hình
    cfg = {}
    pat = re.compile(r'config\.define\(\s*"([^"]+)"')
    for f in walk(os.path.join(ROOT, "plugs"), (".ts",)):
        if f.endswith(".test.ts"):
            continue
        t = read(f)
        for m in pat.finditer(t):
            key = m.group(1)
            # lấy default trong khối define gần nhất (best-effort)
            seg = t[m.end(): m.end() + 900]
            dm = re.search(r"default:\s*([^,\n]+)", seg)
            cfg[key] = (rel(f), dm.group(1).strip() if dm else "—")
    parts.append("## 6. Khóa cấu hình khai báo bằng `config.define`\n")
    parts.append(md_table(["Khóa", "Mặc định (trích nguyên văn)", "Khai báo tại"],
                          [[f"`{k}`", f"`{v[1]}`", f"`{v[0]}`"] for k, v in sorted(cfg.items())]))
    parts.append(
        "\nNgoài ra `chess.pieceSet`, `chess.boardTheme`, `chess.playerName` được đọc bằng "
        "`system.getConfig` (chưa qua `config.define`) — xem `plugs/chess/chess.ts`, "
        "`plugs/chess-ai/opening_stats.ts`.\n"
    )

    # 7. Bảng SQLite
    sq = read(os.path.join(ROOT, "plugs", "chess-db", "sqlite_store.ts"))
    tables = re.findall(r"CREATE (?:VIRTUAL )?TABLE IF NOT EXISTS (\w+)", sq)
    parts.append("## 7. Bảng SQLite (plug `chess-db`)\n")
    parts.append(", ".join(f"`{t}`" for t in tables) + f" — {len(tables)} bảng (kể cả bảng ảo FTS5).\n")

    # 8. Dịch vụ Node
    rows = []
    for d in ["ai-sidecar", "cloud-server"]:
        for f in walk(os.path.join(ROOT, d, "src"), (".ts",)):
            rows.append([f"`{rel(f)}`", count_lines(f)])
    parts.append("## 8. Dịch vụ Node (ai-sidecar, cloud-server)\n")
    parts.append(md_table(["File", "Dòng"], rows))

    # 9. Plug sync
    rows = []
    for f in walk(os.path.join(ROOT, "plugs", "sync"), (".ts",)):
        if f.endswith(".test.ts"):
            continue
        rows.append([f"`{rel(f)}`", count_lines(f)])
    parts.append("\n## 9. Plug `sync` (không tính test)\n")
    parts.append(md_table(["File", "Dòng"], rows))
    parts.append(f"\nTổng: {sum(r[1] for r in rows)} dòng.\n")

    io.open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(parts) + "\n")
    sys.stdout.write("Đã ghi " + rel(OUT).encode("ascii", "replace").decode() + "\n")


if __name__ == "__main__":
    main()
