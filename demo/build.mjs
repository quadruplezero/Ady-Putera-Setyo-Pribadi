// Membangun satu file HTML mandiri berisi seluruh aplikasi (frontend + backend + SQLite WASM).
// Pemakaian: node demo/build.mjs [file-output]
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? `${root}/dist/mainbareng-demo.html`);
const demo = (f) => resolve(root, 'demo', f);

const redirects = {
  name: 'browser-redirects',
  setup(b) {
    b.onResolve({ filter: /^node:sqlite$/ }, () => ({ path: demo('sqlite-shim.js') }));
    b.onResolve({ filter: /^node:(fs|path)$/ }, () => ({ path: demo('node-stubs.js') }));
    b.onResolve({ filter: /\/password\.js$/ }, () => ({ path: demo('password.js') }));
  },
};

const bundle = await build({
  entryPoints: [demo('entry.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  define: { 'process.env.COOKIE_SECURE': '"0"' },
  plugins: [redirects],
});

const read = (p) => readFile(resolve(root, p));
const [indexHtml, styles, icon, sqlJs, wasm] = await Promise.all([
  read('public/index.html').then(String),
  read('public/styles.css').then(String),
  read('public/icon.svg'),
  read('node_modules/sql.js/dist/sql-wasm.js').then(String),
  read('node_modules/sql.js/dist/sql-wasm.wasm'),
]);

const inlineScript = (js) => js.replace(/<\/script/gi, '<\\/script');
const iconUri = `data:image/svg+xml;base64,${icon.toString('base64')}`;
const fontLinks = indexHtml.match(/<link rel="(preconnect|stylesheet)" href="https:\/\/fonts[^>]*>/g).join('\n');
const body = indexHtml
  .slice(indexHtml.indexOf('<body>') + 6, indexHtml.indexOf('</body>'))
  .replace('<script type="module" src="/app.js"></script>', '')
  .replace('src="/icon.svg"', `src="${iconUri}"`)
  .replace(
    '</header>',
    `</header>
    <div class="demo-banner">
      <span>Mode demo: data tersimpan di browser ini saja.</span>
      <button type="button" class="btn secondary small" id="demo-reset">Reset data</button>
    </div>`,
  );

const demoCss = `
.demo-banner {
  display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;
  padding-block: 8px;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  background: var(--accent-soft); color: var(--text); font-size: 0.82rem; font-weight: 600;
}
body::before {
  content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10;
  background: var(--surface);
}`;

const html = `<title>MainBareng</title>
<meta name="description" content="Cari teman main, gabung klub olahraga, catat skor, dan naik peringkat.">
${fontLinks}
<style>
${styles}
${demoCss}
</style>
${body.trim()}
<script>${inlineScript(sqlJs)}</script>
<script>window.__SQL_WASM__ = "${wasm.toString('base64')}";</script>
<script type="module">${inlineScript(bundle.outputFiles[0].text)}</script>
`;

await mkdir(dirname(out), { recursive: true });
await writeFile(out, html);
console.log(`Demo ditulis ke ${out} (${(html.length / 1024).toFixed(0)} KB)`);
