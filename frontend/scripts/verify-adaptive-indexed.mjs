import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:3103';
const dir=process.env.EVIDENCE_DIR||'../.mozak/evidence/adaptive-indexed-flow/browser';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--autoplay-policy=no-user-gesture-required']});
const results={base,checks:[],real:[],errors:[]};
const check=(name,ok)=>{assert.ok(ok,name);results.checks.push(name);};
const response={status:'ok',items:[{text:'nudi čišćenje tepiha',topic:'dom',role:'offer'}],coverage:[0,1,2],neighbourhoodId:'maksimir'};
const empty={results:[],sources:[],truncated:false,indexAvailable:true,sourcesAvailable:true,searched:true};
async function page(){const c=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});const p=await c.newPage();p.on('pageerror',e=>results.errors.push(e.message));return p;}
async function answer(p,text){await p.getByLabel('Tvoj odgovor',{exact:true}).fill(text);await p.getByRole('button',{name:/^(Dalje|Idemo)$/}).click();}
async function done(p){await p.getByTestId('zagreb-map').waitFor({timeout:40000});}
async function settled(p){await p.waitForFunction(()=>document.querySelector('[data-testid="indexed-results"]')?.getAttribute('aria-busy')==='false');}
try {
  const p=await page();let profileCalls=0,areaCalls=0,matchCalls=0;
  await p.route('**/api/zagreb/profile',r=>{profileCalls++;return r.fulfill({json:response});});
  await p.route('**/api/zagreb/neighbourhood',r=>{areaCalls++;return r.fulfill({json:{status:'selected',id:'maksimir'}});});
  await p.route('**/api/zagreb/matches',async r=>{matchCalls++;const body=r.request().postDataJSON();await new Promise(ok=>setTimeout(ok,body.areaId==='sesvete'?850:30));await r.fulfill({json:{...empty,results:[{id:body.areaId,title:`Rezultat ${body.areaId}`,body:'Test fixture, not a live post',source:'reddit',url:null,area:body.areaId,unknown:[]}]}}).catch(()=>{});});
  await p.goto(base);check('no index request before completed profile',matchCalls===0);
  await answer(p,'All details fixture');await done(p);await settled(p);
  check('all-in-one skips three questions',await p.getByTestId('onboarding-step').getAttribute('data-step')==='done');
  check('one extraction and no duplicate neighbourhood request',profileCalls===1&&areaCalls===0&&matchCalls===1);
  await p.getByRole('button',{name:'Cijeli Zagreb',exact:true}).click();await p.waitForTimeout(500);
  check('camera reset never causes a search',matchCalls===1);
  await p.getByLabel('Odaberi područje',{exact:true}).selectOption('sesvete');await p.waitForTimeout(350);
  await p.getByLabel('Odaberi područje',{exact:true}).selectOption('trnje');await settled(p);await p.waitForTimeout(900);
  check('late stale response cannot replace current area results',await p.getByText('Rezultat trnje',{exact:true}).isVisible()&&await p.getByText('Rezultat sesvete',{exact:true}).count()===0);
  const before=matchCalls;await p.getByLabel('Odaberi područje',{exact:true}).selectOption('maksimir');await settled(p);
  check('recent area result reused from bounded cache',matchCalls===before);
  await p.getByTestId('profile-fact').first().click();await settled(p);await p.waitForTimeout(350);
  check('deleting a fact refreshes matching',matchCalls===before+1);
  for(const width of [320,390,768,1440]) {await p.setViewportSize({width,height:960});check(`results layout fits ${width}`,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:`${dir}/results-${width}.png`,fullPage:true});}
  await p.context().close();

  const partial=await page();let partialCalls=0;
  await partial.route('**/api/zagreb/profile',r=>r.fulfill({json:++partialCalls===1?{...response,coverage:[0,2]}:{...response,coverage:[1],neighbourhoodId:undefined}}));
  await partial.route('**/api/zagreb/matches',r=>r.fulfill({json:empty}));
  await partial.goto(base);await answer(partial,'First details');await partial.waitForFunction(()=>document.querySelector('[data-testid="onboarding-step"]')?.dataset.step==='1');
  check('partial answer asks only the missing interest',await partial.getByText('Što te zanima?',{exact:true}).isVisible());
  await answer(partial,'Interests');await done(partial);await settled(partial);
  check('early area survives missing question completion',await partial.getByTestId('zagreb-map').getAttribute('data-selected')==='maksimir');
  check('truthful empty index state',await partial.getByTestId('index-empty').isVisible());
  await partial.context().close();

  const error=await page();await error.route('**/api/zagreb/profile',r=>r.fulfill({json:response}));
  let failed=true;await error.route('**/api/zagreb/matches',r=>failed?r.fulfill({status:503,json:{error:'Pretraga trenutačno nije dostupna.'}}):r.fulfill({json:empty}));
  await error.goto(base);await answer(error,'details');await done(error);await settled(error);
  check('backend failure is not an empty-success claim',await error.getByTestId('index-empty').count()===0&&await error.getByText('Pretraga trenutačno nije dostupna.',{exact:true}).isVisible());
  failed=false;await error.getByRole('button',{name:'Pokušaj ponovno',exact:true}).click();await settled(error);check('retry recovers',await error.getByTestId('index-empty').isVisible());await error.context().close();

  // No endpoint mocks: actual model, Next proxy, backend and PostgreSQL.
  const real=await page();const events=[];real.on('response',async r=>{if(/\/api\/zagreb\/(profile|matches|neighbourhood)$/.test(r.url())) events.push({route:new URL(r.url()).pathname,status:r.status(),body:await r.json()});});
  await real.goto(base);await answer(real,'Ja sam programer. Volim knjige. Nudim čišćenje tepiha. Živim u Maksimiru.');await done(real);await settled(real);
  check('real semantic all-in-one selects map',await real.getByTestId('zagreb-map').getAttribute('data-selected')==='maksimir');
  check('real all-in-one costs one profile call',events.filter(e=>e.route.endsWith('/profile')).length===1&&events.filter(e=>e.route.endsWith('/neighbourhood')).length===0);
  const matches=events.find(e=>e.route.endsWith('/matches'));
  check('real index and source backend available',matches?.body.indexAvailable&&matches?.body.sourcesAvailable);
  if(process.env.EXPECT_INDEX_HIT!=='false') check('existing imported Reddit record rendered through actual index',await real.getByRole('link',{name:/Pranje tepiha u Zagrebu/}).count()===1);
  const directory=real.locator('details');
  check('source directory starts collapsed',await directory.getAttribute('open')===null);
  await directory.locator('summary').click();
  check('directory clearly distinct from collected posts',await real.getByText(/Ovo je imenik poveznica, ne prikupljene objave/).isVisible());
  await directory.locator('summary').click();
  await real.screenshot({path:`${dir}/real-index-desktop.png`,fullPage:true});
  await real.setViewportSize({width:390,height:900});check('real mobile no overflow',await real.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('mobile notes remain above results',await real.evaluate(()=>document.querySelector('[data-testid="profile-notes"]').getBoundingClientRect().bottom<document.querySelector('[data-testid="indexed-results"]').getBoundingClientRect().top));
  await real.screenshot({path:`${dir}/real-index-mobile.png`,fullPage:true});
  results.real=events;await real.context().close();

  const safety=await fetch(`${base}/api/zagreb/profile`,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({step:0,text:'Ja sam programer. Moj brat voli nogomet i živi u Sesvetama. Ja ne volim nogomet.'})});
  const safe=await safety.json();results.real.push({route:'real-safety-profile',status:safety.status,body:safe});
  check('real extraction does not borrow third-party location or offer',safety.ok&&!safe.neighbourhoodId&&!safe.coverage.includes(2));
  check('real extraction does not turn negated preference positive',safe.items.every(i=>!i.text.includes('nogomet')||/ne voli|ne zanima|nije|bez /i.test(i.text)));

  for(const body of [{areaId:'fake',cityWide:false,facts:[]},{areaId:'maksimir',cityWide:false,facts:[],corpus:'bench-fixture'}]) {
    const r=await fetch(`${base}/api/zagreb/matches`,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(body)});check('invalid or injected query rejected',r.status===400);
  }
  const denied=await fetch(`${base}/api/zagreb/matches`,{method:'POST',headers:{origin:'https://evil.invalid','content-type':'application/json'},body:'{}'});check('cross-origin matching denied',denied.status===403);
  check('no uncaught browser errors',results.errors.length===0);
  results.passed=true;await writeFile(`${dir}/results.json`,JSON.stringify(results,null,2));console.log(`PASS ${results.checks.length} adaptive/indexed checks with real provider and PostgreSQL flow`);
} catch(e){await writeFile(`${dir}/failure.json`,JSON.stringify({...results,error:String(e)},null,2));throw e;}
finally {await browser.close();}
