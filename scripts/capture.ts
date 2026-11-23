// Development-only: actual headless Chrome captures and offline interaction checks.
// Entry runtime never invokes Chrome. No browser libraries are installed.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(chrome)) throw new Error('Set CHROME_BIN to your installed Chrome executable');
const expectedBoard=JSON.parse(readFileSync('output/board.json','utf8'));
const profile = mkdtempSync(join(tmpdir(), 'unissued-chrome-'));
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--no-default-browser-check', '--disable-component-update', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio:'ignore' });
const sleep = (ms: number) => new Promise(r => setTimeout(r,ms));
let socket: WebSocket | undefined;
try {
  const portFile = join(profile,'DevToolsActivePort');
  for (let i=0; i<150 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile,'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as any[];
  socket = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise<void>((res,rej)=>{ socket!.onopen=()=>res(); socket!.onerror=rej; });
  let next = 0;
  const pending = new Map<number,{resolve:(v:any)=>void,reject:(v:any)=>void}>();
  const exceptions: any[] = [], requests: any[] = [];
  socket.onmessage = event => {
    const m=JSON.parse(String(event.data));
    if (m.id) { const p=pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); } }
    if (m.method==='Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails);
    if (m.method==='Network.requestWillBeSent') requests.push(m.params.request.url);
  };
  const call = (method:string,params:any={}) => new Promise<any>((resolve,reject)=>{ const id=++next;pending.set(id,{resolve,reject});socket!.send(JSON.stringify({id,method,params})); });
  const evaluate = async (expression:string) => {
    const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const until = async (expression:string) => {
    for(let i=0;i<100;i++) { if(await evaluate(expression)) return; await sleep(50); }
    throw new Error('Timed out: '+expression);
  };
  const shot = async (name:string,height:number) => {
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height,deviceScaleFactor:1,mobile:false});
    await evaluate('window.scrollTo(0,0)');
    await sleep(100);
    const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    writeFileSync(join('screenshots',name),Buffer.from(r.data,'base64'));
  };
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
  // Chrome itself is offline: any accidental fetch cannot succeed.
  await call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  const url=pathToFileURL(resolve('output/dashboard/index.html')).href;
  await call('Page.navigate',{url});
  await until("document.querySelectorAll('tbody tr').length === 8");
  assert.match(await evaluate('document.body.innerText'), /174/);
  const initial=await evaluate("Array.from(document.querySelectorAll('tbody tr')).map(r=>r.cells[1].innerText.split('\\n')[0])");
  await shot('1-board.png',1200);
  await evaluate("document.querySelector('[data-sort=\"tvl_usd\"]').click()");
  assert.equal(await evaluate("document.querySelector('th[aria-sort=\"descending\"] button').dataset.sort"),'tvl_usd');
  await evaluate("document.querySelector('[data-sort=\"tvl_usd\"]').click()");
  assert.equal(await evaluate("document.querySelector('th[aria-sort=\"ascending\"] button').dataset.sort"),'tvl_usd');
  await evaluate("document.querySelector('#search').value='zzzzzz'; document.querySelector('#search').dispatchEvent(new Event('input'))");
  assert.match(await evaluate("document.querySelector('#board-results').innerText"),/No protocols match/);
  await evaluate("document.querySelector('#reset').click();document.querySelector('tbody .name-link').click()");
  await until("!!document.querySelector('#scenario-result')");
  assert.match(await evaluate("document.querySelector('h1').innerText"), new RegExp(initial[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await shot('2-detail.png',1200);
  await evaluate("document.querySelector('#eligible').value='0';document.querySelector('#eligible').dispatchEvent(new Event('input'))");
  assert.match(await evaluate("document.querySelector('#scenario-result').innerText"),/Gross \$0.00/);
  // Every protocol's deep link must render its own plan and calculated value.
  const records=await evaluate('window.RADAR_DATA.rows.map(r=>({slug:r[0],name:r[1]}))');
  const slugs=records.map((p:any)=>p.slug);
  for(const {slug,name} of records) {
    await evaluate(`location.hash=${JSON.stringify('#protocol/'+encodeURIComponent(slug))}`);
    await until(`document.title===${JSON.stringify(name+' / UNISSUED')} && !!document.querySelector('.steps')`);
    const expected=expectedBoard.rows.find((r:any)=>r.slug===slug);
    const actualSteps=await evaluate("Array.from(document.querySelectorAll('.steps li')).map(el=>el.textContent)");
    assert.deepEqual(actualSteps,expected.farm_steps,slug+' rendered plan parity');
    assert.ok((await evaluate("document.querySelector('.formula').innerText")).includes('$'+expected.implied_value_usd.toLocaleString('en-US')),slug+' rendered value parity');
    assert.equal(await evaluate("document.querySelectorAll('.steps li').length"),6);
    assert.ok(await evaluate("document.querySelector('.big-value').innerText.startsWith('$')"));
  }
  await evaluate("location.hash='#board'");await until("!!document.querySelector('#category')");
  await evaluate("document.querySelector('#category').value='Lending';document.querySelector('#category').dispatchEvent(new Event('change'));document.querySelector('#chain').value='Ethereum';document.querySelector('#chain').dispatchEvent(new Event('change'));document.querySelector('#tvl').value='small';document.querySelector('#tvl').dispatchEvent(new Event('change'))");
  assert.ok(await evaluate("Array.from(document.querySelectorAll('tbody tr')).every(r=>r.cells[2].innerText==='Lending')"));
  assert.ok(await evaluate("document.querySelectorAll('tbody .name-link').length>0"));
  await shot('3-filtered.png',1200);
  await evaluate("document.querySelector('#value').value='large';document.querySelector('#value').dispatchEvent(new Event('change'))");
  assert.match(await evaluate("document.querySelector('#board-results').innerText"),/No protocols match/);
  await evaluate("document.querySelector('#reset').click();document.querySelector('#next').click()");
  assert.match(await evaluate("document.querySelector('#results-status').innerText"),/9–16/);
  await evaluate("location.hash='#method'");await until("!!document.querySelector('.method')");
  assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),87);
  await evaluate("location.hash='#board'");await until("!!document.querySelector('#category')");
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'Mobile has page overflow');
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  assert.equal(requests.filter(u=>/^https?:/.test(u)).length,0,'Unexpected network request');
  console.log(JSON.stringify({screenshots:3,board_rows:slugs.length,details_checked:slugs.length,comparables:87,sort:true,filters:true,empty_state:true,pagination:true,scenario:true,mobile:true,offline:true,exceptions:0},null,2));
} finally {
  socket?.close(); proc.kill('SIGTERM');
  await new Promise<void>(res=>{if(proc.exitCode!==null)res();else{proc.once('exit',()=>res());setTimeout(()=>{proc.kill('SIGKILL');res();},3000).unref();}});
  try { rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200}); } catch (error) { console.error("Temporary Chrome profile cleanup:", String(error)); }
}
