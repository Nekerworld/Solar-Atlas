// 천구 엔진을 sky-static/ 에 번들한다 (npm run build:sky).
//
// 천구 엔진 저장소를 이 저장소와 나란히 clone해 두고, 거기서 `yarn install`을 한 번 해 둔다.
// 위치는 기본 ../web (이 저장소 루트 기준), 다르면 SKY_ENGINE_SRC 환경변수로 지정한다.
// 산출물(번들 + 텍스처·별 목록 같은 데이터)은 저장소에 커밋하지 않는다.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(process.env.SKY_ENGINE_SRC || join(here, "..", "..", "..", "web"));
const out = resolve(here, "..", "sky-static");

if (!existsSync(join(source, "js", "Celestiary.js")) || !existsSync(join(source, "node_modules"))) {
  console.error(`천구 엔진 소스를 찾지 못했습니다: ${source}\nclone한 뒤 그 폴더에서 yarn install을 하고, 경로가 다르면 SKY_ENGINE_SRC를 지정하세요.`);
  process.exit(1);
}

// fs.rmSync/cpSync는 한글이 든 경로에서 Node가 조용히 죽는 경우가 있어 직접 지우고 복사한다.
function removeTree(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeTree(join(dir, entry.name));
    else unlinkSync(join(dir, entry.name));
  }
  rmdirSync(dir);
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copyTree(join(from, entry.name), join(to, entry.name));
    else copyFileSync(join(from, entry.name), join(to, entry.name));
  }
}

const esbuild = createRequire(join(source, "package.json"))("esbuild");
const { default: base } = await import(pathToFileURL(join(source, "esbuild", "common.js")).href);

// 천구 엔진 소스는 건드리지 않고, 이 번들을 만들 때만 아래를 고친다.
//  1) 지상에서는 눈높이 2m에서 발밑의 땅이 보여야 한다. 천구 엔진의 가까운 면(near plane)은 지표에서도 100m라
//     가까운 땅이 잘려 나가므로 0.3m로 줄인다.
//  2) 가까운 면을 줄이면 아주 먼 별(수 광년 밖)의 깊이값이 배정밀도에서 정확히 1로 둥글려져, 이름표 위치 계산이
//     그 별들을 "먼 면 밖"이라며 빼 버린다(클릭·강조가 안 됨). 정확히 먼 면 위(≤ 1)까지는 포함하게 한다.
const SOURCE_PATCHES = [
  { filter: /[\\/]js[\\/]zoom\.js$/, from: "export const NEAR_FLOOR_M = 1e2", to: "export const NEAR_FLOOR_M = 0.3" },
  { filter: /[\\/]js[\\/]scene[\\/]labelPick\.js$/, from: "!(nz > -1 && nz < 1)", to: "!(nz > -1 && nz <= 1)" },
  // 빛무리 밖으로 올린 이름표는 클릭·호버 상자도 그 화면 위치를 따른다.
  { filter: /[\\/]js[\\/]scene[\\/]labelPick\.js$/, from: "const nx = ((m[0] * x) + (m[4] * y) + (m[8] * z) + m[12]) / w", to: "let nx = ((m[0] * x) + (m[4] * y) + (m[8] * z) + m[12]) / w" },
  { filter: /[\\/]js[\\/]scene[\\/]labelPick\.js$/, from: "const ny = ((m[1] * x) + (m[5] * y) + (m[9] * z) + m[13]) / w", to: "let ny = ((m[1] * x) + (m[5] * y) + (m[9] * z) + m[13]) / w\n      if (sheet.nudges) {\n        nx += (sheet.nudges[2 * i] || 0) * 2 / (rect.width * pixelRatio)\n        ny += (sheet.nudges[(2 * i) + 1] || 0) * 2 / (rect.height * pixelRatio)\n      }" },
  // 3) 이름표 글자 크기는 천체까지의 거리·밝기에 따라 달라지는데, 거리와 상관없이 늘 같은 크기로 그린다.
  { filter: /[\\/]js[\\/]scene[\\/]labelStyle\.js$/, from: "scale: size / s1,", to: "scale: 1," },
  // 4) 이름표 글자의 위·아래가 잘려 보인다(예: "달"의 윗획이 사라져 "날"처럼 보임). 칸 높이를 글자 먹(ink) 높이로만
  //    재서, 한글처럼 기준선 위로 솟는 획이 칸 밖으로 나가기 때문이다. 칸을 위아래로 넉넉히 늘리고 글자를 그만큼 내려 그린다.
  { filter: /[\\/]js[\\/]scene[\\/]SpriteSheet\.js$/, from: "import * as Utils from '../utils.js'", to: "import * as UtilsBase from '../utils.js'\nconst LABEL_PAD_Y = 4\nconst Utils = {\n  ...UtilsBase,\n  measureText: (ctx, text, font) => {\n    const m = UtilsBase.measureText(ctx, text, font)\n    return {...m, height: m.height + (2 * LABEL_PAD_Y)}\n  },\n}" },
  { filter: /[\\/]js[\\/]scene[\\/]SpriteSheet\.js$/, from: "ctx.fillText(text, 0, 0)", to: "ctx.fillText(text, 0, LABEL_PAD_Y)" },
  // 5) 달은 지상 관측자에서 약 220 반지름 떨어져 있어, 시야를 좁혀 달에 다가가면(유효 거리 30 반지름 미만) 이름표가 숨는다.
  //    위성(달)은 가까이서도 이름표를 유지한다.
  { filter: /[\\/]js[\\/]scene[\\/]Planet\.js$/, from: "const labelTooNearDist = surfaceRadius * 3e1", to: "const labelTooNearDist = isMoon ? surfaceRadius * 1e-2 : surfaceRadius * 3e1" },
];
const appliedPatches = new Set();
const groundPatches = {
  name: "ground-patches",
  setup(build) {
    const groups = new Map();
    for (const patch of SOURCE_PATCHES) {
      const key = patch.filter.source;
      if (!groups.has(key)) groups.set(key, { filter: patch.filter, patches: [] });
      groups.get(key).patches.push(patch);
    }
    for (const { filter, patches } of groups.values()) {
      build.onLoad({ filter }, (args) => {
        appliedPatches.add(filter.source);
        let text = readFileSync(args.path, "utf8");
        for (const { from, to } of patches) {
          if (!text.includes(from)) throw new Error(`천구 엔진 소스가 바뀌었습니다(${args.path}). bundle.mjs의 SOURCE_PATCHES를 고쳐 주세요.`);
          text = text.replace(from, to);
        }
        return { contents: text, loader: "js" };
      });
    }
  },
};

removeTree(out);
mkdirSync(out, { recursive: true });

await esbuild.build({
  ...base,
  plugins: [...(base.plugins ?? []), groundPatches],
  entryPoints: [join(here, "entry.js")],
  outdir: out,
  sourcemap: false,
  metafile: false,
  logLevel: "error",
  // entry.js는 이 저장소에 있으므로 천구 엔진 모듈과 그 의존성(three 등)을 소스 쪽에서 찾게 한다.
  alias: { atlas: join(source, "js"), "atlas-engine": join(source, "js", "Celestiary.js") },
  nodePaths: [join(source, "node_modules")],
  // 데이터는 번들 옆(상대 경로)에서 받는다.
  define: { ...base.define, __DEV__: "false" },
});

if (appliedPatches.size !== new Set(SOURCE_PATCHES.map((patch) => patch.filter.source)).size) {
  throw new Error("천구 엔진 소스 고침이 적용되지 않았습니다(파일 경로가 달라졌을 수 있습니다). bundle.mjs를 확인하세요.");
}

// 텍스처·별 목록 등 데이터는 천구 엔진 번들과 같은 폴더에 둔다.
for (const dir of ["data", "large", "textures", "images"]) {
  if (existsSync(join(source, "public", dir))) copyTree(join(source, "public", dir), join(out, dir));
}

// 별 셰이더는 천구 엔진 빌드가 js/shaders를 사이트 루트에 복사해 서빙한다.
copyTree(join(source, "js", "shaders"), join(out, "shaders"));

writeFileSync(join(out, "ground.html"), `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>Solar Atlas 지상 천구</title>
  <meta name="robots" content="noindex">
  <style>html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }</style>
</head>
<body>
  <script type="module" src="entry.js"></script>
</body>
</html>
`);
console.log(`천구 엔진 번들 완료: ${out}`);
