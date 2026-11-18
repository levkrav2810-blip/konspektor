// Запуск сайта на виртуальном хостинге Спринтхост (Phusion Passenger, PassengerStartupFile app.js).
// Рядом лежит готовая сборка Next.js (server.js, .next, public, node_modules), её собирает GitHub.
// Ключи берутся из файла .env.production в этой же папке: его создают один раз на сервере, в репозиторий он не попадает.
const fs = require("node:fs");
const path = require("node:path");

function loadEnv(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(path.join(__dirname, ".env.production"));
process.env.NODE_ENV = "production";
process.chdir(__dirname);
// Passenger сам подставляет порт: server.js слушает «какой-то» порт, а Passenger перехватывает listen.
require("./server.js");
