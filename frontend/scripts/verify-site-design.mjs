import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:3101';
const dir='../.mozak/evidence/site-design-rework/browser';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'});
const checks=[],errors=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
let page;
async function fixturePage(width=1440,reducedMotion='no-preference'){
 const context=await browser.newContext({viewport:{width,height:960},reducedMotion});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/zagreb/profile',async rt=>{const {step}=rt.request().postDataJSON();await new Promise(r=>setTimeout(r,250));await rt.fulfill({json:{status:'ok',items:[{topic:'none',text:['Voli prirodu','Traži društvo za šetnju','Može pomoći s računalima'][step]}]}});});
 await p.route('**/api/zagreb/neighbourhood',rt=>rt.fulfill({json:{status:'selected',id:'maksimir'}}));
 await p.goto(base);await p.getByLabel('Tvoj odgovor').waitFor();return p;
}
async function answer(p,text,step){await p.getByLabel('Tvoj odgovor').fill(text);await p.getByRole('button',{name:step<3?'Dalje':'Idemo',exact:true}).click();await p.waitForFunction(s=>document.querySelector('[data-testid="onboarding-step"]')?.dataset.step===(s===3?'done':String(s+1)),step);}
try{
 page=await fixturePage();
 check('no initial notes',await page.getByTestId('profile-notes').count()===0);
 check('no modal',await page.getByRole('dialog').count()===0);
 check('solid edge-to-edge blue',await page.evaluate(()=>[[1,1],[innerWidth-2,1],[1,innerHeight-2]].every(([x,y])=>document.elementFromPoint(x,y)?.closest('main')&&getComputedStyle(document.querySelector('main')).backgroundColor==='rgb(8, 76, 170)')));
 await page.screenshot({path:`${dir}/welcome-desktop.png`,fullPage:true});
 await page.getByLabel('Tvoj odgovor').fill('Volim prirodu');await page.getByRole('button',{name:'Dalje',exact:true}).click();
 check('truthful busy state with spinner',await page.getByRole('status').filter({hasText:'Bilježim'}).isVisible());
 await page.waitForFunction(()=>document.querySelector('[data-testid="onboarding-step"]')?.dataset.step==='1');
 check('notes reveal after first detail',await page.getByTestId('profile-fact').count()===1);
 check('question has real entrance animation',await page.getByTestId('onboarding-step').evaluate(el=>el.getAnimations().length>0));
 check('notes reveal has real fade animation',await page.locator('[data-layout-key="notes"]').evaluate(el=>el.getAnimations().length>0));
 await page.waitForTimeout(550);await page.screenshot({path:`${dir}/first-detail-desktop.png`,fullPage:true});
 await answer(page,'Tražim društvo',1);await answer(page,'Pomažem s računalima',2);
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await answer(page,'Maksimir',3);
 await page.waitForFunction(()=>document.querySelector('[data-testid="zagreb-map"]')?.dataset.moving==='false');
 check('actual SVG not tiles',await page.getByTestId('zagreb-map').locator('svg').count()===1&&await page.getByTestId('zagreb-map').locator('img').count()===0);
 check('real polygon highlight not radius circle',await page.getByTestId('map-highlight').locator('path').count()===1&&await page.getByTestId('zagreb-map').locator('circle').count()===0);
 await page.screenshot({path:`${dir}/maksimir-desktop.png`,fullPage:true});
 await page.getByRole('button',{name:'Cijeli Zagreb'}).click();
 await page.waitForTimeout(80);
 check('reset can interrupt camera',await page.getByTestId('zagreb-map').getAttribute('data-moving')==='true');
 await page.getByLabel('Odaberi područje',{exact:true}).selectOption('mo-brezovica');
 await page.waitForFunction(()=>document.querySelector('[data-testid="zagreb-map"]')?.dataset.moving==='false');
 check('local committee selection propagated',await page.getByTestId('zagreb-map').getAttribute('data-selected')==='mo-brezovica');
 check('local committees segmented',await page.locator('[data-region]').count()===218);
 await page.getByLabel('Odaberi područje',{exact:true}).selectOption('tresnjevka');
 check('informal group shows constituent polygons',await page.getByTestId('map-highlight').locator('path').count()===2);
 check('informal boundary disclosure',await page.getByRole('status').filter({hasText:'ne zasebna upravna granica'}).count()===1);
 await page.getByRole('button',{name:'Cijeli Zagreb'}).click();await page.waitForFunction(()=>document.querySelector('[data-testid="zagreb-map"]')?.dataset.moving==='false');
 check('reset returns exact overview',await page.getByTestId('zagreb-map').getAttribute('data-camera')==='0.00,0.00,1.000');
 await page.screenshot({path:`${dir}/overview-desktop.png`,fullPage:true});
 await page.locator('[data-region="sesvete"]').click();
 check('direct polygon click selects its region',await page.getByTestId('zagreb-map').getAttribute('data-selected')==='sesvete');
 check('no map network requests during zoom',requests.every(url=>!url.includes('tile.openstreetmap')&&!url.includes('gis.zagreb')&&!url.includes('nominatim')));
 await page.getByLabel('Odaberi područje',{exact:true}).focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 check('keyboard selection remains available',await page.getByLabel('Odaberi područje',{exact:true}).evaluate(el=>el===document.activeElement));
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(200);
  check(`map no horizontal overflow ${width}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${dir}/map-${width}.png`,fullPage:true});
 }
 const lastNote=page.getByTestId('profile-fact').first();const label=await lastNote.getAttribute('aria-label');await lastNote.click();await page.getByRole('button',{name:label,exact:true}).waitFor({state:'detached'});check('note exits and removes',true);
 await page.context().close();
 for(const width of [320,390]){
  page=await fixturePage(width);check(`welcome no overflow ${width}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${dir}/welcome-${width}.png`,fullPage:true});await answer(page,'Volim prirodu',0);await page.waitForTimeout(500);
  check(`voice before notes ${width}`,await page.evaluate(()=>document.querySelector('[data-layout-key="conversation"]').getBoundingClientRect().top<document.querySelector('[data-layout-key="notes"]').getBoundingClientRect().top));
  await page.getByTestId('profile-fact').click();await page.getByTestId('profile-notes').waitFor({state:'detached'});check(`last note hides panel ${width}`,true);await page.context().close();
 }
 page=await fixturePage(390,'reduce');for(let i=0;i<4;i++)await answer(page,i===3?'Maksimir':'Volim prirodu',i);
 check('reduced motion has no active animations',await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length===0));
 await page.getByRole('button',{name:'Cijeli Zagreb'}).click();check('reduced motion map snaps',await page.getByTestId('zagreb-map').getAttribute('data-moving')==='false');await page.context().close();
 page=await fixturePage();await page.route('**/api/zagreb/profile',rt=>rt.fulfill({status:503,json:{error:'Veza nije dostupna. Pokušaj ponovno.'}}));
 await page.getByLabel('Tvoj odgovor').fill('Volim prirodu');await page.getByRole('button',{name:'Dalje',exact:true}).click();await page.getByRole('status').filter({hasText:'Veza nije dostupna'}).waitFor();
 check('failure preserves typed input and step',await page.getByLabel('Tvoj odgovor').inputValue()==='Volim prirodu'&&await page.getByTestId('onboarding-step').getAttribute('data-step')==='0');
 check('failure does not invent notes',await page.getByTestId('profile-notes').count()===0);await page.screenshot({path:`${dir}/error.png`,fullPage:true});
 await page.unroute('**/api/zagreb/profile');await page.route('**/api/zagreb/profile',rt=>rt.fulfill({json:{status:'ok',items:[{topic:'none',text:'A'.repeat(350)}]}}));
 await page.getByRole('button',{name:'Dalje',exact:true}).click();await page.getByTestId('profile-fact').waitFor();await page.setViewportSize({width:320,height:900});await page.waitForTimeout(550);
 check('long note wraps',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.context().close();
 page=await fixturePage();await page.route('**/api/zagreb/profile',rt=>rt.fulfill({json:{status:'empty',items:[]}}));
 for(let i=0;i<3;i++)await answer(page,'Preskoči',i);
 check('empty extraction never reveals notes',await page.getByTestId('profile-notes').count()===0);
 await page.route('**/api/zagreb/neighbourhood',rt=>rt.fulfill({json:{status:'clarify'}}));
 await page.getByLabel('Tvoj odgovor').fill('Negdje');await page.getByRole('button',{name:'Idemo',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Nisam siguran'}).waitFor();
 check('ambiguous place retains answer without fabricating map',await page.getByLabel('Tvoj odgovor').inputValue()==='Negdje'&&await page.getByTestId('zagreb-map').count()===0);
 check('no uncaught errors',errors.length===0);
 await writeFile(`${dir}/results.json`,JSON.stringify({passed:true,checks,errors,scope:'Browser UI acceptance with fixture answer APIs. Separate live voice test covers provider integration.'},null,2));console.log(`PASS ${checks.length} design browser checks`);
}catch(error){if(page){await page.screenshot({path:`${dir}/failure.png`,fullPage:true}).catch(()=>{});console.error(await page.locator('body').innerText().catch(()=>''));}await writeFile(`${dir}/failure.json`,JSON.stringify({checks,errors,error:String(error)},null,2));throw error;}finally{await browser.close();}
