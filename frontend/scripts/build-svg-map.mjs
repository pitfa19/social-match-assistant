// Build-time only. Downloads City of Zagreb RPJ polygon layers and OSM Sava geometry.
// No map service is contacted by the running application. Run: node scripts/build-svg-map.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const catalogue = JSON.parse(await readFile(new URL('shared/zagreb-neighbourhoods.json', root), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const base = 'https://gis.zagreb.hr/server/rest/services/e_zelenilo/SRPJ/MapServer';
const source = [];
const features = [];
for (const [layer,kind] of [[0,'local_committee'],[1,'district']]) {
 const url = `${base}/${layer}/query?where=1%3D1&outFields=JMS_MB%2CJMS_IME&outSR=3857&returnGeometry=true&maxAllowableOffset=8&f=json`;
 const response = await fetch(url, {signal:AbortSignal.timeout(90000)});
 if(!response.ok) throw Error(`GIS ${response.status}`);
 const text=await response.text();const data=JSON.parse(text);
 if(data.error||data.exceededTransferLimit||data.features?.length!==(layer===0?218:17)) throw Error('Incomplete official geometry response');
 source.push({url,sha256:hash(text),count:data.features.length,kind});
 for(const feature of data.features){
  const entry=catalogue.entries.find(e=>e.kind===kind&&e.officialCode===feature.attributes.JMS_MB);
  if(!entry)throw Error(`Unmapped official code ${feature.attributes.JMS_MB}`);
  features.push({...entry,rings:feature.geometry.rings});
 }
}
const points=features.flatMap(f=>f.rings.flat());
const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
const scale=Math.min(1120/(maxX-minX),920/(maxY-minY));
const dx=(1200-(maxX-minX)*scale)/2,dy=(1000-(maxY-minY)*scale)/2;
const xy=([x,y])=>[+(dx+(x-minX)*scale).toFixed(2),+(dy+(maxY-y)*scale).toFixed(2)];
const merc=(lat,lng)=>[lng*20037508.34/180,Math.log(Math.tan((90+lat)*Math.PI/360))*20037508.34/Math.PI];
const path=(ring,closed=true)=>ring.map((p,i)=>(i?'L':'M')+xy(p).join(',')).join('')+(closed?'Z':'');
const regions=features.map(f=>{
 const p=f.rings.flat().map(xy);const x=p.map(a=>a[0]),y=p.map(a=>a[1]);
 return {id:f.id,name:f.name,kind:f.kind,districtId:f.districtId,officialCode:f.officialCode,path:f.rings.map(r=>path(r)).join(''),bounds:[Math.min(...x),Math.min(...y),Math.max(...x),Math.max(...y)],anchor:xy(merc(f.lat,f.lng))};
});
const riverUrl='https://nominatim.openstreetmap.org/search?q=Sava%20river&format=json&polygon_geojson=1&limit=1';
const riverResponse=await fetch(riverUrl,{headers:{'User-Agent':'ZagrebLocalMapBuild/1.0'},signal:AbortSignal.timeout(45000)});
if(!riverResponse.ok)throw Error(`River ${riverResponse.status}`);
const riverText=await riverResponse.text();const river=JSON.parse(riverText)[0];
if(river?.osm_id!==1564720||river.geojson?.type!=='MultiLineString')throw Error('Unexpected Sava geometry');
const riverLines=[];
for(const line of river.geojson.coordinates){let segment=[];for(const [lng,lat] of line){if(lng>=15.70&&lng<=16.27&&lat>=45.65&&lat<=45.92){segment.push(merc(lat,lng));}else if(segment.length){if(segment.length>1)riverLines.push(segment);segment=[];}}if(segment.length>1)riverLines.push(segment);}
if(!riverLines.length)throw Error('No Sava geometry in Zagreb');
source.push({url:riverUrl,sha256:hash(riverText),kind:'Sava river',osmRelation:1564720,count:riverLines.length});
const riverPath=riverLines.map(line=>path(line,false)).join('');
const result={version:1,viewBox:[0,0,1200,1000],regions,riverPath,provenance:{generatedAt:new Date().toISOString(),publisher:'Grad Zagreb',license:'Otvorena dozvola (OD)',licenseUrl:'https://data.gov.hr/otvorena-dozvola',dataset:'https://data.zagreb.hr/dataset/mjesni-odbori-prostorna-jedinica-mjesne-samouprave-za-podrucje-grada-zagreba',sources:source,transformation:'Official RPJ polygons queried in EPSG:3857 with 8m simplification, scaled uniformly into SVG coordinates. Boundaries are display geometry, not cadastral/legal evidence. Groups select their constituent official districts, never fabricated borders. River: OpenStreetMap contributors, ODbL, simplified display centerline.',riverAttribution:'© OpenStreetMap contributors (ODbL)',coverage:'17 official city districts and 218 local committees. IDs mapped by official code to the application catalogue. Informal names are catalogue aliases or explicitly labelled groups.'}};
const out=new URL('frontend/src/features/zagreb/data/regions.json',root);await mkdir(new URL('.',out),{recursive:true});await writeFile(out,JSON.stringify(result));
await writeFile(new URL('frontend/src/features/zagreb/data/ATTRIBUTION.md',root),'# Map data\n\nCity of Zagreb RPJ: Otvorena dozvola (OD). Dataset and exact query URLs, response hashes and generation time are in regions.json.\n\nSava: © OpenStreetMap contributors, ODbL. https://www.openstreetmap.org/copyright\n\nDerived display geometry is simplified and not suitable for legal boundary decisions. Colloquial groups select official constituent districts, not a newly asserted administrative unit.\n');
console.log(JSON.stringify({regions:regions.length,bytes:JSON.stringify(result).length,riverLines:riverLines.length}));
