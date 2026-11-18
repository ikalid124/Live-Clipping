// Isolated browser smoke test. Uses a temporary profile and database.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const dir = mkdtempSync(join(tmpdir(), "streampulse-browser-"));
const browserPath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => p && existsSync(p));
if (!browserPath) throw Error("Set CHROME_PATH to Chrome or Edge");
const app = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: "18765", STREAMPULSE_DATA: dir },
  stdio: ["ignore", "pipe", "inherit"],
});
let browser;
try {
  await Promise.race([
    once(app.stdout, "data"),
    once(app, "exit").then(() => {
      throw Error("Test server stopped");
    }),
  ]);
  browser = spawn(
    browserPath,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      "--remote-debugging-pipe",
      "--user-data-dir=" + join(dir, "profile"),
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let buffer = "",
    serial = 0;
  const pending = new Map();
  browser.stdio[4].on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
      const m = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const p = pending.get(m.id);
      if (!p) continue;
      pending.delete(m.id);
      m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
    }
  });
  function call(method, params = {}, sessionId) {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("Timed out: " + method));
      }, 12000);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject,
      });
      browser.stdio[3].write(
        JSON.stringify({ method, id, params, sessionId }) + "\0",
      );
    });
  }
  const { targetId } = await call("Target.createTarget", {
    url: "http://127.0.0.1:18765/",
  });
  const { sessionId } = await call("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const evaluate = async (expression) => {
    const v = await call(
      "Runtime.evaluate",
      { expression, returnByValue: true },
      sessionId,
    );
    if (v.exceptionDetails)
      throw Error(
        v.exceptionDetails.exception?.description || "Page exception",
      );
    return v.result.value;
  };
  const wait = async (expression) => {
    for (let i = 0; i < 80; i++) {
      if (await evaluate(expression)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Page check failed: " + expression + " · " +
      await evaluate("document.querySelector('#notice')?.textContent"));
  };
  await wait("document.querySelectorAll('.event').length===3");
  assert.ok(await evaluate("document.querySelector('canvas').width>0"));
  await evaluate("document.querySelector('.event').click()");
  await wait("document.querySelector('textarea')");
  await wait("document.querySelector('video')?.duration > 0");
  await evaluate("document.querySelector('video').play(); true");
  await wait("document.querySelector('video').currentTime > 0.1");
  await evaluate(
    "document.querySelector('[name=rating]').value='Excellent';document.querySelector('textarea').value='Browser smoke test';document.querySelector('[value=Approved]').click()",
  );
  await wait(
    "document.querySelector('.tag')?.textContent.includes('Approved')",
  );
  await evaluate("location.hash='queue'");
  await wait("document.querySelector('#filter')");
  await evaluate(
    "let f=document.querySelector('#filter');f.value='Approved';f.dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await wait("document.querySelectorAll('.event').length===1");
  await evaluate(
    "let scope=document.querySelector('#source');scope.value='Twitch';scope.dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await wait(
    "document.querySelector('.sub')?.textContent.includes('0 pending in Twitch')",
  );
  await evaluate(
    "scope=document.querySelector('#source');scope.value='Demo';scope.dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await wait("document.querySelectorAll('.event').length===1");
  await evaluate("location.hash='channels'");
  await wait("document.querySelector('form[data-action=add]')");
  await evaluate(
    "let a=document.querySelector('form');a.elements.name.value='browserdemo';a.elements.kind.value='Demo';a.requestSubmit()",
  );
  await wait("document.body.innerText.includes('browserdemo')");
  await evaluate("location.hash='settings'");
  await wait("document.querySelector('form[data-action=settings]')");
  await evaluate(
    "document.querySelector('[name=threshold]').value=77;document.querySelector('form[data-action=settings]').requestSubmit()",
  );
  await wait("document.querySelector('[name=threshold]')?.defaultValue==='77'");
  await evaluate("document.querySelector('#testDiscord').click()");
  await wait("document.querySelector('#notice').textContent.includes('DISCORD_WEBHOOK_URL')");
  await evaluate("const preset=document.querySelector('#alertPreset');preset.value='90';preset.dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('[name=notify]').value"), "90");
  await evaluate("window.realNotification=window.Notification;Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'denied',requestPermission:async()=> 'denied'}});document.querySelector('#testBrowser').click()");
  await wait("document.querySelector('#notice').textContent.includes('permission is denied')");
  await evaluate("Object.defineProperty(window,'Notification',{configurable:true,value:window.realNotification});delete window.realNotification");
  await evaluate("const setup=document.querySelector('form[data-action=configureTwitch]');setup.elements.clientId.value='fixture-client';setup.elements.clientSecret.value='fixture-secret';setup.requestSubmit()");
  await wait("document.querySelector('#authorize') && document.querySelector('[name=clientSecret]').value === ''");
  await evaluate("window.normalFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/api/state'))await new Promise(r=>setTimeout(r,6000));return window.normalFetch(...args)};location.hash='activity'");
  await wait("document.querySelector('#crumb').textContent==='Live activity' && document.querySelector('canvas')");
  await evaluate("window.fetch=window.normalFetch;delete window.normalFetch");
  await evaluate("window.normalFetch=window.fetch;window.fetch=async()=>{throw Error('Controlled network outage')};location.hash='settings'");
  await wait("document.querySelector('#health').textContent==='Monitoring status unavailable'");
  await evaluate("window.fetch=window.normalFetch;delete window.normalFetch;location.hash='dashboard'");
  await wait("document.querySelector('#notice').textContent==='' && document.querySelector('canvas')");
  console.log(
    "Passed browser overview, chart, approval, queue filter, watchlist and settings checks.",
  );
} finally {
  browser?.kill();
  app.kill();
}
