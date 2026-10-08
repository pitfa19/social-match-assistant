import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3101',dir='../.mozak/evidence/continuous-voice/browser';
await mkdir(dir,{recursive:true});
const b=await chromium.launch({headless:true,executablePath:'/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'});
const results={};
const ctx=await b.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
const p=await ctx.newPage();
try {
  await p.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError')};});
  await p.goto(base);
  const layouts=[];
  for(const width of [320,390,1440]) {
    await p.setViewportSize({width,height:900});
    const v=await p.evaluate(()=>{
      const section=document.querySelector('section[aria-label="Upoznajmo se"]');
      const voice=document.querySelector('[data-voice-state]').getBoundingClientRect();
      const notes=document.querySelector('section[aria-label="Bilješke o tebi"]').getBoundingClientRect();
      return {width:innerWidth,scroll:document.documentElement.scrollWidth,position:getComputedStyle(section).position,voiceTop:voice.top,notesTop:notes.top};
    });
    assert.ok(v.scroll<=width);assert.notEqual(v.position,'fixed');
    if(width<760)assert.ok(v.voiceTop<v.notesTop);
    layouts.push(v);await p.screenshot({path:`${dir}/initial-${width}.png`,fullPage:true});
  }
  results.layouts=layouts;
  await p.setViewportSize({width:1440,height:960});
  await p.getByRole('button',{name:'Pokreni mikrofon',exact:true}).click();
  await p.getByText('Mikrofon nije dopušten. Dopusti ga ili upiši odgovor.').waitFor();
  assert.equal(await p.locator('[data-testid=onboarding-step]').getAttribute('data-step'),'0');
  results.permissionDenied=true;
  const answers=['Radim kao programer i volim miran život.','Ne volim nogomet. Moj brat voli tenis. Volim čitati knjige.','Mogu pomoći susjedima s računalima.'];
  results.profile=[];
  for(let i=0;i<3;i++) {
    await p.getByRole('textbox',{name:'Tvoj odgovor'}).fill(answers[i]);
    const response=p.waitForResponse(r=>r.url().endsWith('/api/zagreb/profile'));
    await p.getByRole('button',{name:'Dalje',exact:true}).click();
    const r=await response;assert.equal(r.status(),200);
    results.profile.push(await r.json());
    await p.waitForFunction(s=>document.querySelector('[data-testid=onboarding-step]')?.dataset.step===s,String(i+1));
  }
  const notes=await p.getByTestId('profile-notes').innerText();
  assert.ok(!notes.includes('Sport i rekreacija'));assert.ok(!/voli tenis/i.test(notes));
  assert.ok(/ne voli nogomet/i.test(notes));
  await p.getByRole('textbox',{name:'Tvoj odgovor'}).fill('Mjesni odbor Brezovica');
  const response=p.waitForResponse(r=>r.url().endsWith('/api/zagreb/neighbourhood'));
  await p.getByRole('button',{name:'Idemo',exact:true}).click();
  results.neighbourhood=await (await response).json();
  await p.getByTestId('zagreb-map').waitFor();
  const map=p.getByTestId('zagreb-map');
  assert.equal(await map.getAttribute('data-selected'),results.neighbourhood.id);
  assert.notEqual(results.neighbourhood.id,'brezovica');
  assert.match(results.neighbourhood.id,/brezovica/);
  await p.waitForTimeout(1800);
  results.map={id:await map.getAttribute('data-selected'),zoom:await map.getAttribute('data-zoom'),lat:await map.getAttribute('data-lat'),lng:await map.getAttribute('data-lng')};
  assert.ok(Number(results.map.zoom)>12);
  await p.screenshot({path:`${dir}/mo-brezovica-desktop.png`,fullPage:true});
  // No provider call: denied-origin requests must be rejected before token minting.
  results.guard=[];
  for(const path of ['realtime-token','profile']) {
    const r=await fetch(`${base}/api/zagreb/${path}`,{method:'POST',headers:{origin:'https://example.invalid'}});
    assert.equal(r.status,403);results.guard.push({path,status:r.status});
  }
  // Controlled unavailable provider: typed fallback must retain the current question and answer.
  await p.goto(base);
  await p.route('**/api/zagreb/profile',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Pokušaj ponovno.'})}));
  await p.getByRole('textbox',{name:'Tvoj odgovor'}).fill('Volim glazbu');
  await p.getByRole('button',{name:'Dalje',exact:true}).click();
  await p.getByText('Pokušaj ponovno.',{exact:true}).waitFor();
  assert.equal(await p.locator('[data-testid=onboarding-step]').getAttribute('data-step'),'0');
  assert.equal(await p.getByRole('textbox',{name:'Tvoj odgovor'}).inputValue(),'Volim glazbu');
  results.providerFailureRetainsAnswer=true;
  // Late microphone permission resolution after user pause must release tracks and never mint a token.
  await p.unroute('**/api/zagreb/profile');
  await p.evaluate(()=>{
    navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.__resolveMic=resolve});
  });
  let tokenCalls=0;p.on('request',r=>{if(r.url().endsWith('/realtime-token'))tokenCalls++});
  await p.getByRole('button',{name:'Pokreni mikrofon',exact:true}).click();
  await p.getByRole('button',{name:'Pauziraj mikrofon',exact:true}).click();
  await p.evaluate(()=>{
    const a=new AudioContext(),d=a.createMediaStreamDestination();window.__lateStream=d.stream;
    window.__resolveMic(d.stream);
  });
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(()=>window.__lateStream.getTracks().every(t=>t.readyState==='ended')),true);
  assert.equal(tokenCalls,0);results.latePermissionCancelled=true;
  await writeFile(`${dir}/safety-results.json`,JSON.stringify({passed:true,...results},null,2));
  console.log('PASS main-page responsive layout, permission denial, typed real semantic/MO flow, guards, provider failure and late-permission cleanup');
}finally{await b.close()}
