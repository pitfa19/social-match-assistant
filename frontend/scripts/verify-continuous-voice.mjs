import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.BASE_URL || 'http://127.0.0.1:3101';
const dir = '../.mozak/evidence/continuous-voice/browser';
await mkdir(dir, {recursive:true});
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args:['--autoplay-policy=no-user-gesture-required']});
const context = await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
const page = await context.newPage();
const events = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', async r => {
  if (/\/api\/zagreb\/(profile|neighbourhood)$/.test(r.url())) {
    events.push({route:new URL(r.url()).pathname,input:r.request().postDataJSON(),status:r.status(),body:await r.json()});
  }
});
// Replace only the microphone source with synthetic speech. All sockets and API routes remain real.
await page.addInitScript(() => {
  window.__micCalls = 0;
  navigator.mediaDevices.getUserMedia = async () => {
    window.__micCalls++;
    const ac = new AudioContext(); await ac.resume();
    const dest = ac.createMediaStreamDestination();
    window.__mic = {ac,dest};
    return dest.stream;
  };
  window.__speak = async (b64) => {
    const {ac,dest} = window.__mic;
    const data = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const decoded = await ac.decodeAudioData(data.buffer);
    const src=ac.createBufferSource(); src.buffer=decoded; src.connect(dest);
    await new Promise(resolve=>{src.onended=resolve;src.start();});
  };
});
try {
  await page.goto(base);
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.locator('[data-testid=onboarding-step]').getAttribute('data-step'),'0');
  assert.equal(await page.evaluate(()=>window.__micCalls),0);
  await page.screenshot({path:`${dir}/initial-desktop.png`,fullPage:true});
  await page.getByRole('button',{name:'Pokreni mikrofon',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-voice-state]')?.dataset.voiceState==='listening',null,{timeout:30000});
  // Initial silence must not advance the flow.
  await page.waitForTimeout(2200);
  assert.equal(await page.locator('[data-testid=onboarding-step]').getAttribute('data-step'),'0');
  for(let i=0;i<4;i++) {
    await page.waitForFunction(()=>document.querySelector('[data-voice-state]')?.dataset.voiceState==='listening',null,{timeout:30000});
    // Let the post-answer flush finish before feeding the next synthetic utterance.
    await page.waitForTimeout(2000);
    const b64=(await readFile(`/home/pitfa/.jcode/scratch/continuous-voice/answer-${i}.wav`)).toString('base64');
    await page.evaluate(b64=>window.__speak(b64),b64);
    await page.waitForFunction(expected=>document.querySelector('[data-testid=onboarding-step]')?.getAttribute('data-step')===expected,i===3?'done':String(i+1),{timeout:45000});
    console.log(`JCODE_PROGRESS ${JSON.stringify({current:i+1,total:4,message:'Real silence-committed answer processed'})}`);
    if(i===0) {
      const note=page.getByTestId('profile-fact').first();
      const label=await note.getAttribute('aria-label');
      await note.click();
      assert.equal(await page.getByRole('button',{name:label,exact:true}).count(),0);
    }
  }
  assert.equal(await page.evaluate(()=>window.__micCalls),1);
  assert.equal(await page.evaluate(()=>window.__mic.dest.stream.getTracks().every(t=>t.readyState==='ended')),true);
  assert.equal(events.filter(e=>e.route.endsWith('/profile')).length,3);
  assert.equal(events.filter(e=>e.route.endsWith('/neighbourhood')).length,1);
  const selection=events.find(e=>e.route.endsWith('/neighbourhood')).body;
  assert.equal(selection.id,'maksimir');
  assert.equal(await page.getByTestId('zagreb-map').getAttribute('data-selected'),selection.id);
  await page.screenshot({path:`${dir}/map-desktop.png`,fullPage:true});
  const layouts=[];
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(400);
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,dialog:document.querySelectorAll('[role=dialog]').length}));
    assert.ok(layout.scroll<=width,JSON.stringify(layout));
    layouts.push(layout);
    await page.screenshot({path:`${dir}/map-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${dir}/live-results.json`,JSON.stringify({passed:true,micStarts:1,events,layouts,errors},null,2));
  console.log('PASS real continuous voice, 4 silence turns, 3 semantic extractions, notes removal and map selection');
} catch(e) {
  const state=await page.locator('body').innerText().catch(()=> '');
  await page.screenshot({path:`${dir}/failure.png`,fullPage:true}).catch(()=>{});
  await writeFile(`${dir}/failed-run.json`,JSON.stringify({events,errors,state,error:String(e)},null,2));
  console.error(state); throw e;
} finally {await browser.close();}
