import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:3103';
const dir=process.env.EVIDENCE_DIR||'../.mozak/evidence/third-question-fix/local';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--autoplay-policy=no-user-gesture-required']});
const checks=[],events=[],errors=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);};
async function createPage(){const p=await browser.newPage({reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));p.on('response',async r=>{if(/\/api\/zagreb\/(profile|neighbourhood)$/.test(r.url()))events.push({route:new URL(r.url()).pathname,status:r.status(),input:r.request().postDataJSON(),body:await r.json()});});return p;}
const step=(p,n)=>p.waitForFunction(n=>document.querySelector('[data-testid="onboarding-step"]')?.dataset.step===String(n),n,{timeout:40000});
const answer=async(p,text)=>{await p.getByLabel('Tvoj odgovor',{exact:true}).fill(text);await p.getByRole('button',{name:/^(Dalje|Idemo)$/}).click();};
async function firstTwo(p){await p.goto(base);await answer(p,'Ja sam programer.');await step(p,1);await answer(p,'Volim knjige.');await step(p,2);}
let p;
try{
  p=await createPage();await firstTwo(p);
  const notes=await p.getByTestId('profile-notes').innerText();
  await p.getByLabel('Tvoj odgovor',{exact:true}).fill('   ');check('blank answer stays disabled',await p.getByRole('button',{name:'Dalje',exact:true}).isDisabled());
  await answer(p,'Ne znam');await step(p,3);
  check('real third uncertainty advances to neighbourhood',await p.getByText('Koji kvart te zanima?',{exact:true}).isVisible());
  check('uncertainty does not invent profile notes',await p.getByTestId('profile-notes').innerText()===notes);
  await answer(p,'Maksimir');await step(p,'done');check('normal four typed turns reach map',await p.getByTestId('zagreb-map').getAttribute('data-selected')==='maksimir');
  await p.screenshot({path:`${dir}/typed-map.png`,fullPage:true});await p.close();

  // Actual third-turn voice, with only the microphone source replaced by existing synthetic audio.
  p=await createPage();await p.addInitScript(()=>{
    window.__micStarts=0;
    navigator.mediaDevices.getUserMedia=async()=>{window.__micStarts++;const ac=new AudioContext();await ac.resume();const dest=ac.createMediaStreamDestination();window.__mic={ac,dest};return dest.stream;};
    window.__speak=async b64=>{const {ac,dest}=window.__mic;const data=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const src=ac.createBufferSource();src.buffer=await ac.decodeAudioData(data.buffer);src.connect(dest);await new Promise(ok=>{src.onended=ok;src.start();});};
  });
  await firstTwo(p);await p.getByRole('button',{name:'Pokreni mikrofon',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('[data-voice-state]')?.dataset.voiceState==='listening',null,{timeout:30000});
  const clip=(await readFile('/home/pitfa/.jcode/scratch/continuous-voice/answer-2.wav')).toString('base64');
  await p.evaluate(clip=>window.__speak(clip),clip);await step(p,3);
  check('real spoken third answer advances without manual stop',await p.evaluate(()=>window.__micStarts)===1&&await p.getByRole('button',{name:'Pauziraj mikrofon',exact:true}).isVisible());
  await answer(p,'Maksimir');await step(p,'done');check('third voice turn followed by area reaches map',await p.getByTestId('zagreb-map').getAttribute('data-selected')==='maksimir');
  check('microphone tracks stop on completion',await p.evaluate(()=>window.__mic.dest.stream.getTracks().every(t=>t.readyState==='ended')));
  await p.screenshot({path:`${dir}/voice-map.png`,fullPage:true});await p.close();

  // Successful extraction with no coverage must not gate any current question.
  p=await createPage();let calls=0;
  await p.route('**/api/zagreb/profile',r=>{calls++;return r.fulfill({json:{status:'empty',items:[],coverage:[]}});});
  await p.goto(base);for(let i=0;i<3;i++){await answer(p,'Ne znam');await step(p,i+1);}
  check('three successful empty extractions consume exactly three turns',calls===3&&await p.getByTestId('profile-notes').count()===0);await p.close();
  check('no browser errors',errors.length===0);
  await writeFile(`${dir}/results.json`,JSON.stringify({base,passed:true,checks,events,errors},null,2));console.log(`PASS ${checks.length} third-question sequential typing/voice checks`);
}catch(e){await writeFile(`${dir}/failure.json`,JSON.stringify({base,error:String(e),checks,events,errors,state:await p?.locator('body').innerText().catch(()=>null)},null,2));throw e;}
finally{await browser.close();}
