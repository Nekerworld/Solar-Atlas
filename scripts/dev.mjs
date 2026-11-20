#!/usr/bin/env node
// 서비스 전체를 한 명령으로 띄운다: node scripts/dev.mjs
// 순서: 지식 검색 백엔드(8000) -> 플래너 백엔드(8001) -> 프론트엔드(5173).
// 앞 서버가 응답해야 다음 서버를 띄우고, 셋이 모두 떴을 때 브라우저를 연다. Ctrl+C로 셋을 함께 끈다.
//
// 옵션: --no-open  브라우저를 열지 않는다
//       --timeout=<초>  서버 하나가 뜰 때까지 기다리는 시간(기본 120)
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = process.platform === "win32";
const args = process.argv.slice(2);
const OPEN_BROWSER = !args.includes("--no-open");
const TIMEOUT_MS = (Number((args.find((a) => a.startsWith("--timeout=")) || "").split("=")[1]) || 120) * 1000;

const HOST = "127.0.0.1";
const FRONT_URL = `http://${HOST}:5173/Solar-Atlas/`;

const useColor = process.stdout.isTTY;
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const COLORS = { backend: 36, planner: 35, frontend: 32 };

function pythonCommand() {
  const venvPython = IS_WIN
    ? path.join(ROOT, "venv", "Scripts", "python.exe")
    : path.join(ROOT, "venv", "bin", "python");
  if (existsSync(venvPython)) return venvPython;
  console.warn(paint(33, "[dev] venv를 찾지 못해 시스템 Python을 씁니다. (python -m venv venv 로 만들 수 있습니다)"));
  return IS_WIN ? "python" : "python3";
}

const python = pythonCommand();
const services = [
  {
    name: "backend",
    label: "지식 검색 백엔드",
    port: 8000,
    url: `http://${HOST}:8000/api/health/`,
    cwd: path.join(ROOT, "backend"),
    cmd: python,
    args: ["-m", "uvicorn", "fastapi_app:app", "--host", HOST, "--port", "8000"],
  },
  {
    name: "planner",
    label: "플래너 백엔드",
    port: 8001,
    url: `http://${HOST}:8001/health`,
    cwd: path.join(ROOT, "planner_backend"),
    cmd: python,
    args: ["-m", "uvicorn", "app.main:app", "--host", HOST, "--port", "8001"],
  },
  {
    name: "frontend",
    label: "프론트엔드",
    port: 5173,
    url: FRONT_URL,
    cwd: path.join(ROOT, "frontend"),
    cmd: IS_WIN ? "npm.cmd" : "npm",
    args: ["run", "dev", "--", "--host", HOST, "--port", "5173", "--strictPort"],
  },
];

const children = [];
const tails = new Map(); // 서비스별 마지막 출력(실패 원인 표시용)
let shuttingDown = false;

function log(text) {
  console.log(paint(1, `[dev] ${text}`));
}

function pipeLines(service, stream, target) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const tail = tails.get(service.name);
      tail.push(line);
      if (tail.length > 15) tail.shift();
      target.write(`${paint(COLORS[service.name], `[${service.name}]`)} ${line}\n`);
    }
  });
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  try {
    if (IS_WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    /* 이미 종료됨 */
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("서버를 종료합니다...");
  for (const child of children) killTree(child);
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function isUp(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500) });
    return true; // 어떤 상태 코드든 응답이 오면 서버는 떠 있다
  } catch {
    return false;
  }
}

function fail(service, reason) {
  if (shuttingDown) return;
  console.error(paint(31, `\n[dev] ${service.label}(${service.port}) 실패: ${reason}`));
  const tail = tails.get(service.name) || [];
  if (tail.length) {
    console.error(paint(31, "[dev] 마지막 출력:"));
    for (const line of tail) console.error(`  ${line}`);
  }
  shutdown(1);
}

function start(service) {
  tails.set(service.name, []);
  // Windows의 npm.cmd는 셸을 거쳐야 하므로 한 줄 명령으로 넘긴다(인자 배열 + shell 조합은 Node가 경고한다).
  const viaShell = IS_WIN && service.cmd.endsWith(".cmd");
  const child = spawn(viaShell ? [service.cmd, ...service.args].join(" ") : service.cmd, viaShell ? [] : service.args, {
    cwd: service.cwd,
    env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8", FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    shell: viaShell,
    detached: !IS_WIN, // POSIX에서 프로세스 그룹으로 묶어 한 번에 종료
    windowsHide: true,
  });
  children.push(child);
  child.service = service;
  pipeLines(service, child.stdout, process.stdout);
  pipeLines(service, child.stderr, process.stderr);
  child.on("error", (error) => fail(service, `실행하지 못했습니다 (${error.message})`));
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    fail(service, `프로세스가 종료되었습니다 (code=${code ?? signal})`);
  });
  return child;
}

async function waitUntilUp(service, child) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (shuttingDown) return false;
    if (child.exitCode !== null) return false; // exit 핸들러가 원인을 출력한다
    if (await isUp(service.url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail(service, `${TIMEOUT_MS / 1000}초 안에 응답하지 않았습니다 (${service.url})`);
  return false;
}

function openBrowser(url) {
  const [cmd, cmdArgs] = IS_WIN
    ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];
  spawn(cmd, cmdArgs, { stdio: "ignore", detached: true, windowsHide: true }).unref();
}

async function main() {
  if (!existsSync(path.join(ROOT, ".env"))) {
    console.warn(paint(33, "[dev] 저장소 루트에 .env가 없습니다. GMS_KEY 등 키가 없으면 LLM·장소 검색이 동작하지 않습니다."));
  }
  if (!existsSync(path.join(ROOT, "frontend", "node_modules"))) {
    log("frontend/node_modules가 없어 npm install을 먼저 실행합니다...");
    const install = spawnSync(IS_WIN ? "npm.cmd install" : "npm install", {
      cwd: path.join(ROOT, "frontend"),
      stdio: "inherit",
      shell: true,
    });
    if (install.status !== 0) {
      console.error(paint(31, "[dev] npm install에 실패했습니다."));
      process.exit(1);
    }
  }
  if (!existsSync(path.join(ROOT, "frontend", "public", "sky", "ground.html"))) {
    console.warn(
      paint(33, "[dev] 천구 번들(frontend/public/sky)이 없어 지상 모드에 하늘이 보이지 않습니다. (cd frontend && npm run build:sky)"),
    );
  }

  for (const service of services) {
    if (await isUp(service.url)) {
      fail(service, `포트 ${service.port}에서 이미 다른 서버가 응답하고 있습니다. 먼저 종료한 뒤 다시 실행하세요.`);
      return;
    }
    log(`${service.label} 시작 (포트 ${service.port})`);
    const child = start(service);
    if (!(await waitUntilUp(service, child))) return;
    log(`${service.label} 준비 완료 -> ${service.url}`);
  }

  log(`모든 서버가 떴습니다. 종료하려면 Ctrl+C. 주소: ${FRONT_URL}`);
  if (OPEN_BROWSER) openBrowser(FRONT_URL);
}

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
