// Empacota a Lambda: bundle com esbuild -> dist/index.js -> dist/function.zip
import { build } from "esbuild";
import { createWriteStream } from "node:fs";
import { mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { platform } from "node:os";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/handler.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.js",
  // aws-sdk v3 ja vem no runtime Lambda; nao precisa empacotar
  external: ["@aws-sdk/*"],
  sourcemap: false,
  minify: true,
});

// zip (usa 'zip' no unix; no Windows usa powershell Compress-Archive)
const isWin = platform() === "win32";
try {
  if (isWin) {
    execSync(
      'powershell -NoProfile -Command "Compress-Archive -Path dist/index.js -DestinationPath dist/function.zip -Force"',
      { stdio: "inherit" },
    );
  } else {
    execSync("cd dist && zip -q -9 function.zip index.js", { stdio: "inherit" });
  }
  console.log("dist/function.zip gerado.");
} catch (e) {
  console.error("Falha ao gerar zip:", e.message);
  process.exit(1);
}
