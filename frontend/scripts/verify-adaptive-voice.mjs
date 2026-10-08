import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:3103';
const dir=process.env.EVIDENCE_DIR||'../.mozak/evidence/adaptive-indexed-flow/voice';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--autoplay-policy=no-user-gesture-required']});
const p=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
const events=[],errors=[];p.on('pageerror',e=>errors.push(e.message));
p.on('response',async r=>{if(/\/api\/zagreb\/(profile|neighbourhood|matches)$/.test(r.url()))events.push({route:new URL(r.url()).pathname,status:r.status(),input:r.request().postDataJSON(),body:await r.json()});});
await p.addInitScript(()=>{
  window.__micCalls=0;
  navigator.mediaDevices.getUserMedia=async()=>{window.__micCalls++;const ac=new AudioContext();await ac.resume();const dest=ac.createMediaStreamDestination();window.__mic={ac,dest};return dest.stream;};
  window.__speakAll=async encoded=>{
    const {ac,dest}=window.__mic;
    const clips=[];
    for(const b64 of encoded){
      const decoded=await ac.decodeAudioData(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer);
      const samples=decoded.getChannelData(0);let a=0,z=samples.length-1;
      while(a<z&&Math.abs(samples[a])<0.006)a++;
      while(z>a&&Math.abs(samples[z])<0.006)z--;
      clips.push(samples.slice(Math.max(0,a-480),Math.min(samples.length,z+480)));
    }
    const gap=Math.floor(ac.sampleRate*.12);
    const audio=ac.createBuffer(1,clips.reduce((n,c)=>n+c.length+gap,0),ac.sampleRate);let offset=0;
    for(const clip of clips){audio.copyToChannel(clip,0,offset);offset+=clip.length+gap;}
    const src=ac.createBufferSource();src.buffer=audio;src.connect(dest);
    await new Promise(ok=>{src.onended=ok;src.start();});
  };
});
try {
  await p.goto(base);await p.getByRole('button',{name:'Pokreni mikrofon',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('[data-voice-state]')?.dataset.voiceState==='listening',null,{timeout:30000});
  const audio=await Promise.all([0,1,2,3].map(async i=>(await readFile(`/home/pitfa/.jcode/scratch/continuous-voice/answer-${i}.wav`)).toString('base64')));
  await p.evaluate(audio=>window.__speakAll(audio),audio);
  await p.getByTestId('zagreb-map').waitFor({timeout:50000});
  await p.waitForFunction(()=>document.querySelector('[data-testid="indexed-results"]')?.getAttribute('aria-busy')==='false');
  assert.equal(await p.evaluate(()=>window.__micCalls),1);
  assert.equal(events.filter(e=>e.route.endsWith('/profile')).length,1);
  assert.equal(events.filter(e=>e.route.endsWith('/neighbourhood')).length,0);
  assert.equal(await p.getByTestId('zagreb-map').getAttribute('data-selected'),'maksimir');
  assert.equal(await p.evaluate(()=>window.__mic.dest.stream.getTracks().every(t=>t.readyState==='ended')),true);
  assert.deepEqual(errors,[]);
  await p.screenshot({path:`${dir}/all-in-one-voice.png`,fullPage:true});
  await writeFile(`${dir}/results.json`,JSON.stringify({passed:true,base,micStarts:1,events,errors,limitation:'Synthetic speech joined from existing four fixtures. All provider APIs real. This verifies integration and skipping, not human speech accuracy.'},null,2));
  console.log('PASS real all-in-one voice: one mic, one extraction, skipped prompts, selected map and indexed search');
} catch(e){await p.screenshot({path:`${dir}/failure.png`,fullPage:true});await writeFile(`${dir}/failure.json`,JSON.stringify({events,errors,text:await p.locator('body').innerText(),error:String(e)},null,2));throw e;}
finally{await browser.close();}
