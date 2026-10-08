import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const output = resolve(process.env.EXPORT_DIR || resolve(homedir(), 'Downloads', 'social-match-design-2026-10-08'));
const base = process.env.APP_URL || 'http://127.0.0.1:3000';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const states = [];

async function capture(file, title) {
  const html = await page.evaluate(({ file, title }) => {
    const css = Array.from(document.styleSheets).map(sheet => { try { return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n'); } catch { return ''; } }).join('\n');
    const root = document.documentElement.cloneNode(true);
    root.querySelectorAll('script, link, nextjs-portal').forEach(node => node.remove());
    root.querySelectorAll('meta[http-equiv],meta[name="next-size-adjust"]').forEach(node => node.remove());
    root.querySelector('title').textContent = title + ' | Dizajnerski izvoz';
    const originals = document.querySelectorAll('textarea,input,select');
    root.querySelectorAll('textarea,input,select').forEach((node, index) => {
      const original = originals[index];
      if (node.tagName === 'TEXTAREA') node.textContent = original.value;
      else if (node.tagName === 'SELECT') Array.from(node.options).forEach(option => option.toggleAttribute('selected', option.value === original.value));
      else { node.setAttribute('value', original.value); node.toggleAttribute('checked', original.checked); }
    });
    root.querySelectorAll('audio').forEach(node => node.remove());
    root.querySelector('body').style.overflow = '';
    const style = document.createElement('style');
    style.textContent = css + '\n.export-nav{position:fixed;bottom:8px;left:8px;right:8px;z-index:9999;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:8px 14px;background:#fbf8ef;border:1px solid #d5c9aa;border-radius:12px;font:12px system-ui;color:#254e3c;box-shadow:0 2px 12px #0001}.export-nav a{text-decoration:underline}.export-nav span{margin-right:auto}@media print{.export-nav{display:none}}';
    root.querySelector('head').append(style);
    const nav = document.createElement('nav');
    nav.className = 'export-nav'; nav.setAttribute('aria-label', 'Dizajnerski prikazi');
    nav.innerHTML = '<span>Offline dizajn · bez API-ja i stvarne pretrage</span><a href="index.html">Početna</a><a href="introduction.html">Razgovor</a><a href="review.html">Potvrda</a><a href="profile.html">Profil</a><a href="search.html">Pretraga</a><a href="post.html">Objava</a>';
    root.querySelector('body').append(nav);
    const script = document.createElement('script');
    script.textContent = `document.addEventListener('submit',e=>e.preventDefault());document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const t=b.textContent.trim();const map={'Predstavi se':'introduction.html','Profil':'profile.html','Pretraži':'search.html','Dalje':'review.html','Preskoči':'review.html','Potvrdi i spremi':'saved.html','Spremi promjene':'saved.html','Natrag na razgovor':'introduction.html','Pronađi':'search.html','Pomozi mi napisati objavu':'post.html'};if(map[t])location.href=map[t];else if(t==='Zatvori'||b.getAttribute('aria-label')==='Zatvori')location.href='index.html';else{b.title='Ovo je statički dizajnerski izvoz. Za funkcionalni demo koristi lokalnu aplikaciju.';}});`;
    root.querySelector('body').append(script);
    root.querySelectorAll('button').forEach(button => {
      button.removeAttribute('disabled');
      if (button.textContent.trim() === 'Pritisni za govor') { button.disabled = true; button.title = 'Snimanje je dostupno u lokalnoj aplikaciji, ne u statičkom izvozu.'; }
    });
    return '<!doctype html>\n' + root.outerHTML;
  }, { file, title });
  await writeFile(resolve(output, file), html);
  await page.screenshot({ path: resolve(output, file.replace('.html', '.png')), fullPage: true });
  states.push({ file, title });
  console.log('Exported', file);
}

try {
  await page.goto(base);
  await page.getByRole('button', { name: 'Predstavi se', exact: true }).waitFor({ state: 'visible' });
  await capture('index.html', 'Početna');
  await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
  await capture('introduction.html', 'Predstavi se');
  for (const answer of ['Tražim sobu i nudim pomoć s računalima.', 'Trešnjevka, radnim danom navečer.', 'Najviše 450 eura uključujući režije.', 'Želim samostalno potvrditi svaku objavu.']) {
    await page.locator('#intro-input').fill(answer);
    await page.getByRole('button', { name: 'Dalje', exact: true }).click();
  }
  await capture('review.html', 'Potvrda profila');
  await page.getByRole('button', { name: 'Potvrdi i spremi', exact: true }).click();
  await capture('saved.html', 'Početna s profilom');
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await capture('profile.html', 'Profil');
  await page.getByRole('button', { name: 'Zatvori', exact: true }).click();
  await page.getByRole('button', { name: 'Pretraži', exact: true }).click();
  await page.getByLabel('Što trenutno tražite ili nudite?').fill('soba');
  await page.getByText('Filtri', { exact: true }).click();
  await page.getByRole('radio', { name: 'Najam', exact: true }).check();
  await page.getByLabel('Ukupni proračun (€)').fill('450');
  await page.getByRole('button', { name: 'Pronađi', exact: true }).click();
  await capture('search.html', 'Pretraga');
  await page.getByRole('button', { name: 'Pomozi mi napisati objavu', exact: true }).first().click();
  await capture('post.html', 'Nacrt objave');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ kind: 'offline-design-handoff', source: base, generatedAt: new Date().toISOString(), states, synthetic: true, functionalApp: false }, null, 2));
  await writeFile(resolve(output, 'README.md'), `# Dizajnerski izvoz za Claude Design\n\nOtvori index.html ili prenesi ZIP u Claude Design. Svaki HTML prikaz sadrži vlastiti CSS i SVG ilustraciju: nije potreban server, internet ili npm. Navigacija na dnu povezuje sedam prikaza. PNG datoteke prikazuju stvarni lokalni frontend.\n\nOvo je statički vizualni izvoz iz izgrađene aplikacije, ne druga implementacija proizvoda. Gumbi vode između snimljenih prikaza. Promjene teksta se ne spremaju i ne pokreću pretragu. Mikrofon je u izvozu isključen. Za funkcionalni demo koristi ${base}.\n\nSav prikazani profil i oglasi su sintetički. Facebook, Reddit, ElevenLabs i AI nisu povezani. Nema API ključeva, korisničkih podataka ni vanjskih resursa.\n\n## Nastavak u Claude Design\nZadrži hrvatski jezik, dva gumba na početnoj stranici (Predstavi se / Profil i Pretraži), potvrdu tekstualnog profila, odvojene razgovor/pretragu i jasno označene demo podatke. Vizualne izmjene napravi u HTML/CSS-u, a zatim ih prenesi u Next.js komponente.\n`);
} finally { await browser.close(); }
console.log('Design export:', output);
