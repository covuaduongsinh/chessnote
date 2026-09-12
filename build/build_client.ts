import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import * as sass from "sass";
import { bundleAssets } from "../client/asset_bundle/builder.ts";
import { patchBundledJS } from "../client/plugos/plug_compile.ts";

// This builds the client and puts it into client_bundle/client

export async function buildClient(): Promise<void> {
  await mkdir("client_bundle/client", { recursive: true });
  await mkdir("client_bundle/base_fs", { recursive: true });

  console.log("Now ESBuilding the client and service workers...");

  const baseBuildConfig: esbuild.BuildOptions = {
    outdir: "client_bundle/client",
    absWorkingDir: process.cwd(),
    bundle: true,
    treeShaking: true,
    // Safari 16.4 is the oldest engine the client actually works on (regex lookbehind and CSS
    // @property need it) and corresponds to macOS 12 Monterey
    target: ["safari16.4"],
    sourcemap: "linked",
    minify: true,
    jsxFactory: "h",
    // metafile: true,
    format: "esm",
    chunkNames: ".client/[name]-[hash]",
    jsx: "automatic",
    jsxFragment: "Fragment",
    jsxImportSource: "preact",
  };

  const buildConfigs: Array<[String, esbuild.BuildOptions]> = [
    [
      "client",
      {
        ...baseBuildConfig,
        entryPoints: [
          {
            in: "client/boot.ts",
            out: ".client/client",
          },
        ],
        splitting: true,
      },
    ],
    [
      "service worker",
      {
        ...baseBuildConfig,
        entryPoints: [
          {
            in: "client/service_worker.ts",
            out: "service_worker",
          },
        ],
        splitting: false,
      },
    ],
    [
      "spaces ui",
      {
        ...baseBuildConfig,
        entryPoints: [
          {
            in: "client/spaces_ui/spaces.tsx",
            out: ".client/spaces",
          },
        ],
        splitting: false,
      },
    ],
    [
      "setup ui",
      {
        ...baseBuildConfig,
        entryPoints: [
          {
            in: "client/spaces_ui/setup.tsx",
            out: ".client/setup",
          },
        ],
        splitting: false,
      },
    ],
    [
      "auth ui",
      {
        ...baseBuildConfig,
        entryPoints: [
          {
            in: "client/spaces_ui/auth.tsx",
            out: ".client/auth",
          },
        ],
        splitting: false,
      },
    ],
  ];

  for (const [buildName, buildConfig] of buildConfigs) {
    const result = await esbuild.build(buildConfig);

    if (result.metafile) {
      const text = await esbuild.analyzeMetafile(result.metafile!);
      console.log(`Bundle info for ${buildName}`, text);
    }
  }

  await copyAssets("client_bundle/client/.client");
  await patchServiceWorker();

  console.log("Built!");
}

async function copyAssets(dist: string) {
  await mkdir(dist, { recursive: true });
  await cp("client/fonts", dist, { recursive: true });
  await cp("client/html", dist, { recursive: true });
  await cp("client/images/favicon-96x96.png", `${dist}/favicon-96x96.png`);
  await cp("client/images/favicon.svg", `${dist}/favicon.svg`);
  await cp("client/images/favicon.ico", `${dist}/favicon.ico`);
  await cp(
    "client/images/apple-touch-icon.png",
    `${dist}/apple-touch-icon.png`,
  );
  await cp("client/images/logo.png", `${dist}/logo.png`);
  await cp("client/images/logo-dock.png", `${dist}/logo-dock.png`);
  // Small copy of the dock icon for inline UI use (the Space Manager's
  // wordmark). Generated from logo-dock.png — see that file's note in
  // client/images/README.md. The 1024px original is 405 KB for something
  // drawn at ~26 CSS px.
  await cp("client/images/logo-dock-96x96.png", `${dist}/logo-dock-96x96.png`);

  // Three stylesheets, all compiled from the same partials so they cannot
  // drift: main.css for the editor, app.css for the standalone pages (login,
  // setup wizard, Space Manager) and components.css for plug panel iframes —
  // the last kept under that name because `panelStyles()` and the plug docs
  // reference it.
  for (const [entry, output] of [
    ["main.scss", "main.css"],
    ["app.scss", "app.css"],
    ["components_bundle.scss", "components.css"],
  ]) {
    const scss = await readFile(`client/styles/${entry}`, "utf-8");
    const compiled = sass.compileString(scss, {
      loadPaths: ["client/styles"],
      style: "compressed",
    });
    await writeFile(`${dist}/${output}`, compiled.css, "utf-8");
  }

  // Everything below this point bakes STATIC, offline-only assets
  // (manifest.json, .config, base_fs.json, and a template-variable-free
  // index.html) into the *same* `.client/` directory the Rust server reads
  // and Jinja-templates per request (see server/src/handlers/bundle.rs,
  // `template_index_html`). That's fine for the standalone Capacitor mobile
  // bundle (which has no server and needs everything pre-resolved), but
  // doing it unconditionally silently overwrote the real server's
  // `.client/index.html` — replacing `{{ host_prefix }}`/`.client/`-prefixed
  // asset paths with hardcoded/stripped ones — which breaks the normal
  // self-hosted web app: the browser requests bare `/client.js` (which
  // doesn't exist as a route) instead of `/.client/client.js`, so the whole
  // client silently fails to boot (blank page, zero console output, since
  // Chrome refuses to execute a `<script type="module">` whose response
  // Content-Type isn't a JS type — here it's the SPA-fallback HTML).
  // See docs/plans/2026-09-07-danh-gia-va-ke-hoach-hoan-thien-chessnote.md.
  // Gate it behind an explicit `--mobile` CLI flag so `npm run build`
  // (server, desktop) keeps the real templated shell, and only
  // `npm run mobile:build` (which passes the flag) gets the baked
  // standalone one. A flag (not an env var) so the same npm script works
  // identically whether npm's script-shell is cmd.exe, PowerShell, or bash.
  const isStandaloneBuild =
    process.argv.includes("--mobile") ||
    process.argv.includes("--desktop") ||
    process.argv.includes("--standalone");
  if (isStandaloneBuild) {
    // Generate manifest.json
    const manifest = {
      name: "ChessNote",
      short_name: "ChessNote",
      description: "ChessNote - Chess Knowledge & Study Base",
      start_url: "./",
      display: "standalone",
      background_color: "#1e293b",
      theme_color: "#1e293b",
      icons: [
        {
          src: "favicon-96x96.png",
          type: "image/png",
          sizes: "96x96",
        },
        {
          src: "logo.png",
          type: "image/png",
          sizes: "512x512",
        },
        {
          src: "apple-touch-icon.png",
          type: "image/png",
          sizes: "180x180",
        },
      ],
    };
    await writeFile(
      `${dist}/manifest.json`,
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );

    // Generate default .config for offline/standalone mode
    const defaultBootConfig = {
      spaceFolderPath: "ChessNote",
      indexPage: "INDEX",
      readOnly: false,
      enableClientEncryption: false,
      spacePrefixes: [],
    };
    await writeFile(
      `${dist}/.config`,
      JSON.stringify(defaultBootConfig, null, 2),
      "utf-8",
    );

    // Copy standard libraries base_fs to .fs for offline access
    try {
      await cp("client_bundle/base_fs", `${dist}/.fs`, { recursive: true });
    } catch (e) {
      console.warn("Could not copy base_fs to .fs:", e);
    }

    // Create base_fs.json bundle containing all plugs and initial space template
    try {
      const baseBundle = await bundleAssets("client_bundle/base_fs", ["**/*"]);
      if (!baseBundle.has("INDEX.md")) {
        baseBundle.writeTextFileSync(
          "INDEX.md",
          "text/markdown",
          `# ♟️ Chào mừng đến với ChessNote

Chào mừng bạn đến với **ChessNote** - Hệ thống ghi chú và nghiên cứu tri thức cờ vua chuyên sâu.

## 🌟 Bàn cờ FEN tương tác
\`\`\`fen
r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4
\`\`\`

## ⚔️ Ván đấu PGN
\`\`\`pgn
[Event "FIDE World Championship 2024"]
[Site "Singapore"]
[Date "2024.12.12"]
[White "Ding, Liren"]
[Black "Gukesh, D"]
[Result "0-1"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Qc2 O-O 5. a3 Bxc3+ 6. Qxc3 d5 0-1
\`\`\`

## 🧩 Bài tập Chiến thuật (Puzzle)
\`\`\`puzzle
fen: 5rk1/5ppp/8/8/8/3B1N2/8/3QKR2 w - - 0 1
turn: white
solution: Bxh7+ Kxh7 Ng5+ Kg8 Qh5
hint: Đòn thí Tượng kinh điển phá thành (Greek Gift Sacrifice)
themes: Sacrifice, Attacking King
\`\`\`
`,
        );
      }
      await writeFile(
        `${dist}/base_fs.json`,
        JSON.stringify(baseBundle.toJSON(), null, 2),
        "utf-8",
      );
    } catch (e) {
      console.warn("Could not create base_fs.json:", e);
    }

    // Generate static standalone index.html (with template variables cleaned)
    let indexHtml = await readFile("client/html/index.html", "utf-8");
    indexHtml = indexHtml.replaceAll(
      '<base href="{{ host_prefix | safe }}/" />',
      '<base href="./" />',
    );
    indexHtml = indexHtml.replaceAll("{{ host_prefix | safe }}", "");
    indexHtml = indexHtml.replaceAll("{{ title }}", "ChessNote");
    indexHtml = indexHtml.replaceAll(
      "{{ description }}",
      "ChessNote - Chess Knowledge & Study Base",
    );
    indexHtml = indexHtml.replaceAll(
      "{{ additional_head_html | safe }}",
      "<script>globalThis.silverbullet = { offlineOnly: true };</script>",
    );
    indexHtml = indexHtml.replaceAll("{{ content | safe }}", "");
    indexHtml = indexHtml.replaceAll(".client/", "");
    await writeFile(`${dist}/index.html`, indexHtml, "utf-8");
  }

  // HACK: Patch the JS by removing an invalid regex
  let bundleJs = await readFile(`${dist}/client.js`, "utf-8");
  bundleJs = patchBundledJS(bundleJs);
  await writeFile(`${dist}/client.js`, bundleJs, "utf-8");
}

// Shells and bundles for the server-level surfaces (Space Manager at /.spaces,
// the setup wizard at /.setup) and the per-space login page. None of these are
// part of the offline app shell: they are entry points the service worker must
// never answer from cache. Add an entry here when adding a bundle entry point.
const NOT_PRECACHED = new Set([
  "auth.html",
  "authorize.html",
  "auth.js",
  "index.html",
  "spaces.html",
  "spaces.js",
  "setup.html",
  "setup.js",
  "app.css",
  "LICENSE.md",
]);

async function patchServiceWorker() {
  // Scan .client/ directory to build the full precache file list
  const clientDir = "client_bundle/client/.client";
  const allFiles = await readdir(clientDir);
  const precacheFiles = [
    "/", // The index page
    "/.client/manifest.json", // Dynamically generated by the server, but needed for PWA
    ...allFiles
      .filter((f) => !f.endsWith(".map") && !NOT_PRECACHED.has(f))
      .map((f) => `/.client/${f}`),
  ];
  const precacheFilesStr = precacheFiles.join(",");

  // Patch the service_worker {{CACHE_NAME}} and {{PRECACHE_FILES}}
  let swCode = await readFile(
    "client_bundle/client/service_worker.js",
    "utf-8",
  );
  swCode = swCode.replaceAll("{{CACHE_NAME}}", `cache-${Date.now()}`);
  swCode = swCode.replaceAll("{{PRECACHE_FILES}}", precacheFilesStr);
  await writeFile("client_bundle/client/service_worker.js", swCode, "utf-8");
  await writeFile(`${clientDir}/service_worker.js`, swCode, "utf-8");
  try {
    await cp(
      "client_bundle/client/service_worker.js.map",
      `${clientDir}/service_worker.js.map`,
    );
  } catch {}
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  await buildClient();
  await esbuild.stop();
}
