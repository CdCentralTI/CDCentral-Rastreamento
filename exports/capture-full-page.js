const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawn, execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(__dirname, "cdcentral-site-completo.png");
const profileDir = path.join(__dirname, ".chrome-capture-profile");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9223;
const viewportWidth = 1440;

async function main() {
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome não encontrado em ${chromePath}`);
  }

  safeRemove(profileDir);
  fs.mkdirSync(profileDir, { recursive: true });

  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${viewportWidth},900`,
    "about:blank",
  ], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });

  try {
    console.log("Aguardando Chrome DevTools...");
    await waitForDebugger();
    console.log("Conectando ao alvo da página...");
    const target = await getPageTarget();
    const client = await createCdpClient(target.webSocketDebuggerUrl);

    console.log("Habilitando Page/Runtime...");
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    const loadEvent = client.waitForEvent("Page.loadEventFired", 15000);
    console.log("Navegando para o site local...");
    await client.send("Page.navigate", {
      url: pathToFileURL(path.join(root, "index.html")).href,
    });
    await loadEvent;

    console.log("Preparando página para captura...");
    await client.send("Runtime.evaluate", {
      expression: `
        (() => {
          document.querySelectorAll('img').forEach((img) => {
            img.loading = 'eager';
          });
          document.querySelectorAll('[data-reveal]').forEach((node) => {
            node.classList.add('is-visible');
          });
          document.documentElement.style.scrollBehavior = 'auto';
          window.scrollTo(0, 0);
          return true;
        })()
      `,
    });

    await delay(900);

    console.log("Medindo altura da página...");
    const heightResult = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `
        Math.ceil(Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight
        ))
      `,
    });

    const viewportHeight = Math.max(1200, heightResult.result.value);
    console.log(`Capturando ${viewportWidth}x${viewportHeight}...`);
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await client.send("Runtime.evaluate", {
      expression: `
        document.querySelectorAll('[data-reveal]').forEach((node) => {
          node.classList.add('is-visible');
        });
        window.scrollTo(0, 0);
      `,
    });

    await delay(2200);

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: viewportWidth,
        height: viewportHeight,
        scale: 1,
      },
    });

    fs.writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
    await client.close();
    killChrome(chrome);
    safeRemove(profileDir);

    return {
      outputPath,
      width: viewportWidth,
      height: viewportHeight,
      bytes: fs.statSync(outputPath).size,
    };
  } catch (error) {
    killChrome(chrome);
    safeRemove(profileDir);
    throw error;
  }
}

function killChrome(chrome) {
  if (chrome?.pid) {
    try {
      execFileSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      if (!chrome.killed) chrome.kill("SIGKILL");
    }
  }
}

function safeRemove(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(__dirname))) {
    throw new Error(`Recusando remover caminho fora de exports: ${resolved}`);
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) return;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

async function waitForDebugger() {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error("Chrome DevTools não ficou disponível a tempo.");
}

async function getPageTarget() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await response.json();
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("Nenhuma página aberta no Chrome headless.");
  return page;
}

function createCdpClient(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const events = new Map();

    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const messageId = ++id;
          ws.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((res, rej) => {
            const timeout = setTimeout(() => {
              pending.delete(messageId);
              rej(new Error(`Timeout em ${method}`));
            }, 15000);
            pending.set(messageId, { resolve: res, reject: rej, timeout });
          });
        },
        waitForEvent(method, timeoutMs) {
          return new Promise((res, rej) => {
            const timeout = setTimeout(() => {
              rej(new Error(`Timeout esperando evento ${method}`));
            }, timeoutMs);
            events.set(method, (params) => {
              clearTimeout(timeout);
              events.delete(method);
              res(params);
            });
          });
        },
        close() {
          ws.close();
          return Promise.resolve();
        },
      });
    });

    ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id && pending.has(payload.id)) {
        const deferred = pending.get(payload.id);
        pending.delete(payload.id);
        clearTimeout(deferred.timeout);
        if (payload.error) {
          deferred.reject(new Error(payload.error.message));
        } else {
          deferred.resolve(payload.result);
        }
        return;
      }

      if (payload.method && events.has(payload.method)) {
        events.get(payload.method)(payload.params);
      }
    });

    ws.addEventListener("error", reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
