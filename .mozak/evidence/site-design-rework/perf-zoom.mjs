// Compare actual rendering on the same browser/viewport. Only answer APIs are fixtures.
import { chromium } from '/home/pitfa/Documents/social-match-assistant/frontend/node_modules/playwright-core/index.mjs';
import { writeFile } from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:3101';
const label = process.env.LABEL || 'baseline';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome' });
const results = [];
try {
for (let r = 0; r < 3; r++) {
 const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
 const page = await ctx.newPage();
 await page.route('**/api/zagreb/profile', rt => rt.fulfill({ json: { status: 'ok', items: [{kind:'fact',text:'Voli prirodu'}] } }));
 await page.route('**/api/zagreb/neighbourhood', rt => rt.fulfill({ json: { status: 'selected', id:'maksimir' } }));
 const tiles=[]; page.on('request', q=>{if(q.url().includes('tile.openstreetmap.org'))tiles.push(q.url());});
 await page.goto(base);
 const input=page.getByLabel('Tvoj odgovor');
 for(let i=0;i<3;i++) {await page.waitForFunction(i=>document.querySelector('[data-testid="onboarding-step"]')?.dataset.step===String(i),i);await input.fill('Volim prirodu');await page.getByRole('button',{name:'Dalje',exact:true}).click();}
 await page.waitForFunction(()=>document.querySelector('[data-testid="onboarding-step"]')?.dataset.step==='3');
 await input.fill('Maksimir');
 await page.evaluate(()=>{
  const p=window.__perf={frames:[],start:performance.now(),clicked:0,last:performance.now(),firstMap:0,lastChange:0,value:'',done:false};
  document.querySelector('button[type="submit"]').addEventListener('click',()=>{p.clicked=performance.now();},{once:true,capture:true});
  const tick=now=>{p.frames.push(now-p.last);p.last=now;const m=document.querySelector('[data-testid="zagreb-map"]');if(m){if(!p.firstMap)p.firstMap=now;const v=m.dataset.zoom+':'+m.dataset.camera;if(v!==p.value){p.value=v;p.lastChange=now;}}if(!p.done)requestAnimationFrame(tick);};requestAnimationFrame(tick);
 });
 await page.getByRole('button',{name:'Idemo',exact:true}).click();
 await page.waitForFunction(()=>{const p=window.__perf;return p.firstMap && performance.now()-p.firstMap>500 && performance.now()-p.lastChange>450;},null,{timeout:20000});
 const m=await page.evaluate(()=>{const p=window.__perf;p.done=true;const map=document.querySelector('[data-testid="zagreb-map"]');return {measurementStartToMapMs:p.firstMap-p.start,clickToMapMs:p.firstMap-p.clicked,harnessActionabilityWaitMs:p.clicked-p.start,cameraMovementMs:p.lastChange-p.firstMap,frames:p.frames.slice(1),endZoom:map.dataset.zoom,imgs:map.querySelectorAll('img').length};});
 const sorted=[...m.frames].sort((a,b)=>a-b);const q=p=>sorted[Math.min(sorted.length-1,Math.floor(p*sorted.length))];
 results.push({run:r+1,measurementStartToMapMs:Math.round(m.measurementStartToMapMs),harnessActionabilityWaitMs:Math.round(m.harnessActionabilityWaitMs),clickToMapMs:Math.round(m.clickToMapMs),cameraMovementMs:Math.round(m.cameraMovementMs),endZoom:m.endZoom,frameMs:{median:q(.5),p95:q(.95),max:q(1)},framesOver33ms:m.frames.filter(f=>f>33.4).length,tileRequests:tiles.length,imgElements:m.imgs});
 await page.screenshot({path:new URL(`${label}-map.png`,import.meta.url).pathname});await ctx.close();
}
} finally {await browser.close();}
const out={label,capturedAt:new Date().toISOString(),appUrl:base,environment:{viewport:'1440x960',browser:'Chromium1243 headless',answerApis:'fixtures',rendering:'actual application',note:'No CPU/network throttling. Frame deltas include idle settle window. Repeated fresh browser contexts. Not a human latency study. Original baseline clickToMapMs began before Playwright actionability waits and is not comparable to corrected event-based clickToMapMs. Camera movement and tile request measurements are unchanged. Identical legacy profile fixtures are discarded by validation, so both runs contain no extracted facts.'},runs:results};
await writeFile(new URL(`${label}-zoom.json`,import.meta.url),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
