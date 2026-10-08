import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:3103';
const dir=process.env.EVIDENCE_DIR||'../.mozak/evidence/adaptive-indexed-flow/partial';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',headless:true});
const p=await browser.newPage({reducedMotion:'reduce'});
const events=[],errors=[],checks=[];
p.on('pageerror',e=>errors.push(e.message));
p.on('response',async r=>{if(/\/api\/zagreb\/(profile|matches|neighbourhood)$/.test(r.url()))events.push({route:new URL(r.url()).pathname,status:r.status(),input:r.request().postDataJSON(),body:await r.json()});});
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);};
const answer=async text=>{await p.getByLabel('Tvoj odgovor',{exact:true}).fill(text);await p.getByRole('button',{name:/^(Dalje|Idemo)$/}).click();};
const settled=()=>p.waitForFunction(()=>document.querySelector('[data-testid="indexed-results"]')?.getAttribute('aria-busy')==='false');
try{
  await p.goto(base);
  await answer('Ja sam programer. Nudim čišćenje tepiha. Živim u Maksimiru.');
  await p.waitForFunction(()=>document.querySelector('[data-testid="onboarding-step"]')?.dataset.step==='1',{},{timeout:40000});
  check('real first answer leaves only interest question',await p.getByText('Što te zanima?',{exact:true}).isVisible());
  check('no premature index request',!events.some(e=>e.route.endsWith('/matches')));
  await answer('Volim knjige.');await p.getByTestId('zagreb-map').waitFor({timeout:40000});await settled();
  check('real second answer uses remembered area without asking intent or place',await p.getByTestId('zagreb-map').getAttribute('data-selected')==='maksimir');
  check('two profile requests and zero area requests',events.filter(e=>e.route.endsWith('/profile')).length===2&&!events.some(e=>e.route.endsWith('/neighbourhood')));
  await p.getByRole('checkbox',{name:'Cijeli Zagreb',exact:true}).check();await settled();
  check('citywide option reaches backend once',events.filter(e=>e.route.endsWith('/matches')&&e.input.cityWide).length===1);
  const before=events.length;await p.getByLabel('Preciziraj pretragu').fill('pranje tepiha');await p.waitForTimeout(400);
  check('typing does not send queries',events.length===before);
  await p.getByLabel('Tražim ili nudim').selectOption('offer');
  const customResponse=p.waitForResponse(r=>r.url().endsWith('/api/zagreb/matches')&&r.request().postDataJSON()?.facts?.[0]?.text==='pranje tepiha');
  await p.getByRole('button',{name:'Pretraži',exact:true}).click();await customResponse;await settled();
  check('explicit custom intent reaches bounded search',events.filter(e=>e.route.endsWith('/matches')).at(-1).input.facts[0].role==='offer');
  await p.getByRole('button',{name:'Koristi moje bilješke'}).click();await p.getByRole('button',{name:'Koristi moje bilješke'}).waitFor({state:'hidden'});await settled();
  check('restore profile reuses recent result',events.filter(e=>e.route.endsWith('/matches')).length===3);
  check('no browser errors',errors.length===0);
  await writeFile(`${dir}/results.json`,JSON.stringify({passed:true,base,checks,events,errors},null,2));console.log(`PASS ${checks.length} real partial and search-control checks`);
}catch(e){await writeFile(`${dir}/failure.json`,JSON.stringify({error:String(e),events,checks,errors},null,2));throw e;}
finally{await browser.close();}
