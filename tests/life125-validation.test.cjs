'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'life125.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'inline application script is present');

function app() {
  const defaults = {
    name:'本人', birth:'1990-01-01', endAge:'95', cash:'300', salary:'20',
    eventType:'future', eventRepeat:'once', eventNote:'', timelineYear:'2026',
    expense:'18', retireAge:'65', pensionAge:'65', pension:'12', invest:'0',
    contribution:'2', withdraw:'0', returnRate:'3', inflation:'2',
    wageGrowth:'0', debt:'0', debtRate:'0', repayment:'0'
  };
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {value:defaults[id]??'',innerHTML:'',textContent:'',dataset:{}});
    return elements.get(id);
  };
  let canClear = true, canExport = true, canRestore = true, canSave = true;
  const storage = {removeItem:()=>{}};
  const alerts=[];
  const downloads=[], revoked=[], exportBlobs=[];
  let exportFailure=null;
  const context = vm.createContext({
    document:{getElementById:get,createElement:()=>({click(){
      if(exportFailure==='click')throw Error('download blocked');
      downloads.push({href:this.href,filename:this.download});
    }})},
    localStorage:storage,confirm:message=>message.includes('この端末に家族の呼び名')?canSave:message.includes('バックアップには')?canExport:message.includes('復元すると')?canRestore:canClear,alert:message=>alerts.push(message),
    Blob:class {constructor(parts,options){this.content=parts.join('');this.options=options;exportBlobs.push(this)}},
    URL:{createObjectURL:()=>{if(exportFailure==='url')throw Error('object URL blocked');return 'blob:life125-test'},
         revokeObjectURL:url=>revoked.push(url)},
    setTimeout:callback=>callback()
  });
  vm.runInContext(script, context, {timeout:3000});
  const importFile=async file=>{const input=get('import');input.files=file?[file]:[];input.value='life125-backup.json';await input.onchange({target:input});return input};
  return {importFile,get, alerts, storage, exports:{downloads,revoked,exportBlobs,setFailure:v=>{exportFailure=v}}, clear:()=>get('clear').onclick(), setCanClear:v=>{canClear=v}, setCanSave:v=>{canSave=v}, setCanExport:v=>{canExport=v}, setCanRestore:v=>{canRestore=v}, calculate:()=>vm.runInContext('calculate()', context, {timeout:3000}), restore:data=>{context.__backup=data;vm.runInContext('restore(__backup)',context,{timeout:3000})}, snapshot:()=>JSON.parse(vm.runInContext('JSON.stringify(snapshot())',context,{timeout:3000}))};
}

test('invalid upper age clears previous projections, then valid input restores them', () => {
  const {get,calculate}=app();
  assert.match(get('stats').innerHTML,/最終純資産/);
  assert.match(get('yearRows').innerHTML,/<tr>/);
  assert.match(get('chart').innerHTML,/<svg/);
  get('endAge').value='126'; calculate();
  assert.equal(get('stats').innerHTML,'');
  assert.equal(get('yearRows').innerHTML,'');
  assert.equal(get('chart').innerHTML,'');
  assert.match(get('message').textContent,/125歳以下/);
  get('endAge').value='95'; calculate();
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('empty numerical input cannot silently become zero', () => {
  const {get,calculate}=app();
  get('salary').value=''; calculate();
  assert.equal(get('stats').innerHTML,'');
  assert.match(get('message').textContent,/数値入力/);
});

test('impossible birthdate is rejected without showing stale assets', () => {
  const {get,calculate}=app();
  get('birth').value='1990-02-30'; calculate();
  assert.equal(get('yearRows').innerHTML,'');
  assert.match(get('message').textContent,/正しい日付/);
});

test('invalid inflation clears results and explains the problem', () => {
  const {get,calculate}=app();
  get('inflation').value='-100'; calculate();
  assert.equal(get('chart').innerHTML,'');
  assert.match(get('message').textContent,/物価/);
});

test('future birthdate is rejected', () => {
  const {get,calculate}=app();
  get('birth').value='2999-01-01'; calculate();
  assert.equal(get('stats').innerHTML,'');
  assert.match(get('message').textContent,/今日以前/);
});

test('valid leap-day birthdate remains accepted', () => {
  const {get,calculate}=app();
  get('birth').value='1992-02-29'; calculate();
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('valid JSON backup restores family and event', () => {
  const {restore,snapshot}=app();
  const backup=snapshot();
  backup.families=[{name:'家族',role:'配偶者',birth:'1988-04-01'}];
  backup.events=[{date:'2030-03-01',title:'進学',type:'future',amount:-10,repeat:'once'}];
  restore(backup);
  assert.deepEqual(snapshot().families,backup.families);
  assert.deepEqual(snapshot().events,backup.events);
});

test('invalid JSON backup does not partially overwrite existing settings', () => {
  const {restore,snapshot}=app();
  const before=snapshot();
  const bad=structuredClone(before);
  bad.fields.salary='100';
  bad.events=[{date:'2030-01-01',title:'不正',type:'future',amount:'Infinity',repeat:'once'}];
  assert.throws(()=>restore(bad),/イベントデータ/);
  assert.deepEqual(snapshot(),before);
});

test('invalid family date and missing field reject without mutation', () => {
  const {restore,snapshot}=app();
  const before=snapshot();
  const invalidDate=structuredClone(before);
  invalidDate.families=[{name:'家族',role:'家族',birth:'2026-02-30'}];
  assert.throws(()=>restore(invalidDate),/家族データ/);
  const missing=structuredClone(before);
  delete missing.fields.salary;
  assert.throws(()=>restore(missing),/設定項目/);
  assert.deepEqual(snapshot(),before);
});

test('over-limit backup and unsupported event type are rejected', () => {
  const {restore,snapshot}=app();
  const before=snapshot();
  const tooMany=structuredClone(before);
  tooMany.events=Array.from({length:2001},()=>({date:'2030-01-01',title:'予定',type:'future',amount:0,repeat:'once'}));
  assert.throws(()=>restore(tooMany),/登録件数/);
  const wrongType=structuredClone(before);
  wrongType.events=[{date:'2030-01-01',title:'予定',type:'unexpected',amount:0,repeat:'once'}];
  assert.throws(()=>restore(wrongType),/イベントデータ/);
  assert.deepEqual(snapshot(),before);
});

test('unbounded investment growth invalidates rather than displaying Infinity', () => {
  const {get,calculate}=app();
  get('returnRate').value='1e308';
  calculate();
  assert.equal(get('stats').innerHTML,'');
  assert.equal(get('chart').innerHTML,'');
  assert.match(get('message').textContent,/範囲/);
  get('returnRate').value='3';
  calculate();
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('negative wage growth below minus 100 percent is rejected', () => {
  const {get,calculate}=app();
  get('wageGrowth').value='-200';
  calculate();
  assert.equal(get('stats').innerHTML,'');
  assert.match(get('message').textContent,/範囲/);
});

test('overflow of combined cash and investments does not render invalid totals', () => {
  const {get,calculate}=app();
  get('cash').value='1e308';
  get('invest').value='1e308';
  calculate();
  assert.equal(get('yearRows').innerHTML,'');
  assert.match(get('message').textContent,/範囲/);
});


test('local storage deletion reports success only after removeItem succeeds', () => {
  const {get,storage,clear}=app();
  let deletedKey;
  storage.removeItem=key=>{deletedKey=key};
  clear();
  assert.equal(deletedKey,'softazio-life125-v1');
  assert.match(get('message').textContent,/削除しました/);
});

test('blocked local storage deletion is caught without a false success message', () => {
  const {get,storage,clear}=app();
  storage.removeItem=()=>{throw new Error('SecurityError')};
  assert.doesNotThrow(clear);
  assert.match(get('message').textContent,/削除できませんでした/);
  assert.doesNotMatch(get('message').textContent,/削除しました/);
});

test('cancelled deletion leaves local storage untouched', () => {
  const {storage,clear,setCanClear}=app();
  let calls=0;
  storage.removeItem=()=>{calls++};
  setCanClear(false);
  clear();
  assert.equal(calls,0);
});

test('invalid input does not overwrite a previously saved backup', () => {
  const {get,storage}=app();
  let writes=0;
  storage.setItem=()=>{writes++};
  get('salary').value='';
  get('save').onclick();
  assert.equal(writes,0);
  assert.match(get('message').textContent,/数値入力/);
});

test('valid input saves a complete backup after validation', () => {
  const {get,storage}=app();
  let key, saved;
  storage.setItem=(k,v)=>{key=k;saved=JSON.parse(v)};
  get('save').onclick();
  assert.equal(key,'softazio-life125-v1');
  assert.equal(saved.version,1);
  assert.equal(saved.fields.salary,'20');
  assert.match(get('message').textContent,/保存しました/);
});

test('overflowing simulation does not overwrite saved data', () => {
  const {get,storage}=app();
  let writes=0;
  storage.setItem=()=>{writes++};
  get('returnRate').value='1e308';
  get('save').onclick();
  assert.equal(writes,0);
  assert.match(get('message').textContent,/範囲/);
});

test('event creation rejects blank amount without altering existing events', () => {
  const {get,snapshot,alerts}=app();
  get('eventDate').value='2030-04-01';
  get('eventTitle').value='進学';
  get('eventAmount').value='';
  const before=snapshot().events;
  get('addEvent').onclick();
  assert.deepEqual(snapshot().events,before);
  assert.match(alerts.at(-1),/収支額/);
});

test('event creation rejects impossible date and non-finite amount', () => {
  const {get,snapshot,alerts}=app();
  get('eventTitle').value='進学';
  get('eventAmount').value='-10';
  get('eventDate').value='2030-02-30';
  get('addEvent').onclick();
  assert.equal(snapshot().events.length,0);
  assert.match(alerts.at(-1),/正しい日付/);
  get('eventDate').value='2030-03-01';
  get('eventAmount').value='1e309';
  get('addEvent').onclick();
  assert.equal(snapshot().events.length,0);
  assert.match(alerts.at(-1),/収支額/);
});

test('event creation preserves valid zero and negative amounts', () => {
  const {get,snapshot}=app();
  get('eventDate').value='2030-04-01';
  get('eventTitle').value='進学';
  get('eventAmount').value='0';
  get('eventType').value='future';
  get('eventRepeat').value='once';
  get('addEvent').onclick();
  assert.deepEqual(snapshot().events[0],{date:'2030-04-01',title:'進学',type:'future',amount:0,repeat:'once'});
  get('eventAmount').value='-12.5';
  get('addEvent').onclick();
  assert.equal(snapshot().events[1].amount,-12.5);
});

test('event creation rejects unsupported event category and repetition', () => {
  const {get,snapshot,alerts}=app();
  get('eventDate').value='2030-04-01';
  get('eventTitle').value='進学';
  get('eventAmount').value='-10';
  get('eventType').value='unknown';
  get('addEvent').onclick();
  assert.equal(snapshot().events.length,0);
  assert.match(alerts.at(-1),/種類/);
  get('eventType').value='future';
  get('eventRepeat').value='monthly';
  get('addEvent').onclick();
  assert.equal(snapshot().events.length,0);
  assert.match(alerts.at(-1),/繰り返し/);
});

test('family creation rejects invalid and future birthdates without mutation', () => {
  const {get,snapshot,alerts}=app();
  get('familyName').value='家族';
  for(const birth of ['2026-02-30','2999-01-01','']) {
    get('familyBirth').value=birth;
    get('addFamily').onclick();
    assert.equal(snapshot().families.length,0);
    assert.match(alerts.at(-1),/生年月日/);
  }
});

test('family creation accepts a valid leap day and preserves nickname', () => {
  const {get,snapshot}=app();
  get('familyName').value=' 家族 ';
  get('familyRole').value='配偶者';
  get('familyBirth').value='2000-02-29';
  get('addFamily').onclick();
  assert.deepEqual(snapshot().families,[{name:'家族',role:'配偶者',birth:'2000-02-29'}]);
});

test('family creation enforces name and role lengths', () => {
  const {get,snapshot,alerts}=app();
  get('familyBirth').value='2000-01-01';
  get('familyName').value='x'.repeat(61);
  get('addFamily').onclick();
  assert.equal(snapshot().families.length,0);
  get('familyName').value='家族';
  get('familyRole').value='x'.repeat(41);
  get('addFamily').onclick();
  assert.equal(snapshot().families.length,0);
  assert.match(alerts.at(-1),/続柄/);
});

test('family creation stops at the 100-person backup limit', () => {
  const {get,snapshot,alerts}=app();
  get('familyName').value='家族';
  get('familyBirth').value='2000-01-01';
  for(let i=0;i<101;i++)get('addFamily').onclick();
  assert.equal(snapshot().families.length,100);
  assert.match(alerts.at(-1),/100人/);
});

test('backup restoration rejects future family birthdate atomically', () => {
  const {restore,snapshot}=app();
  const before=snapshot();
  const invalid=structuredClone(before);
  invalid.families=[{name:'家族',role:'家族',birth:'2999-01-01'}];
  assert.throws(()=>restore(invalid),/家族データ/);
  assert.deepEqual(snapshot(),before);
});


test('restoration rolls back when wage growth makes projection invalid', () => {
  const {get,restore,snapshot}=app();
  const before=snapshot();
  const invalid=structuredClone(before);
  invalid.fields.wageGrowth='-200';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.match(get('stats').innerHTML,/最終純資産/);
  assert.match(get('chart').innerHTML,/<svg/);
});

test('restoration rolls back when extreme returns overflow projection', () => {
  const {get,restore,snapshot}=app();
  const before=snapshot();
  const invalid=structuredClone(before);
  invalid.fields.returnRate='1e308';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.match(get('stats').innerHTML,/最終純資産/);
  assert.match(get('chart').innerHTML,/<svg/);
});


test('failed JSON import clears file input and allows selecting the same file again', async () => {
  const {importFile,get,snapshot}=app();
  const before=snapshot();
  const malformed={size:5,text:async()=>'{bad}'};
  const input=await importFile(malformed);
  assert.equal(input.value,'');
  assert.deepEqual(snapshot(),before);
  assert.match(get('message').textContent,/読み込みに失敗/);
  const valid={size:100,text:async()=>JSON.stringify({...before,fields:{...before.fields,salary:'35'}})};
  await importFile(valid);
  assert.equal(input.value,'');
  assert.equal(snapshot().fields.salary,'35');
  assert.match(get('message').textContent,/バックアップから復元しました/);
});

test('oversized JSON import clears file input before rejecting it', async () => {
  const {importFile,get,snapshot}=app();
  const before=snapshot();
  const input=await importFile({size:1000001,text:async()=>{throw Error('should not read')}});
  assert.equal(input.value,'');
  assert.deepEqual(snapshot(),before);
  assert.match(get('message').textContent,/1MB以下/);
});


test('blocked local backup read reports storage error without changing current inputs', () => {
  const {get,storage,snapshot}=app();
  const before=snapshot();
  storage.getItem=()=>{throw Error('SecurityError')};
  get('load').onclick();
  assert.deepEqual(snapshot(),before);
  assert.match(get('message').textContent,/保存領域を読み取れません/);
});

test('malformed local backup is not deleted and does not replace current inputs', () => {
  const {get,storage,snapshot}=app();
  const before=snapshot();
  let deletions=0;
  storage.getItem=()=>'{broken';
  storage.removeItem=()=>{deletions++};
  get('load').onclick();
  assert.deepEqual(snapshot(),before);
  assert.equal(deletions,0);
  assert.match(get('message').textContent,/読み込めませんでした/);
  assert.match(get('message').textContent,/削除していません/);
});

test('empty stored backup is treated as corrupted rather than missing', () => {
  const {get,storage}=app();
  storage.getItem=()=>'';
  get('load').onclick();
  assert.match(get('message').textContent,/読み込めませんでした/);
  assert.doesNotMatch(get('message').textContent,/保存データはありません/);
});

test('valid local backup restores inputs and reports success', () => {
  const {get,storage,snapshot}=app();
  const backup=snapshot();
  backup.fields.salary='35';
  storage.getItem=()=>JSON.stringify(backup);
  get('load').onclick();
  assert.equal(snapshot().fields.salary,'35');
  assert.match(get('message').textContent,/端末の保存を復元しました/);
});

test('JSON export creates a backup and releases its object URL', () => {
  const {get,exports}=app();
  get('export').onclick();
  assert.equal(exports.downloads.length,1);
  assert.equal(exports.downloads[0].filename,'life125-backup.json');
  assert.equal(JSON.parse(exports.exportBlobs[0].content).fields.salary,'20');
  assert.deepEqual(exports.revoked,['blob:life125-test']);
  assert.match(get('message').textContent,/バックアップのダウンロードを開始しました/);
});

test('blocked object URL creation reports failure instead of throwing', () => {
  const {get,exports}=app();
  exports.setFailure('url');
  assert.doesNotThrow(()=>get('export').onclick());
  assert.equal(exports.downloads.length,0);
  assert.deepEqual(exports.revoked,[]);
  assert.match(get('message').textContent,/バックアップを保存できませんでした/);
});

test('failed download click reports failure and still releases object URL', () => {
  const {get,exports}=app();
  exports.setFailure('click');
  assert.doesNotThrow(()=>get('export').onclick());
  assert.equal(exports.downloads.length,0);
  assert.deepEqual(exports.revoked,['blob:life125-test']);
  assert.match(get('message').textContent,/バックアップを保存できませんでした/);
});

test('invalid projection does not start JSON download', () => {
  const {get,exports}=app();
  get('salary').value='';
  get('export').onclick();
  assert.equal(exports.downloads.length,0);
  assert.equal(exports.exportBlobs.length,0);
  assert.match(get('message').textContent,/数値入力/);
});


test('backup controls use understandable labels while preserving JSON file format', () => {
  assert.match(html, /id="save">この端末に保存<\/button>/);
  assert.match(html, /id="load">端末の保存を復元<\/button>/);
  assert.match(html, /id="export">バックアップを保存<\/button>/);
  assert.match(html, /id="importButton" aria-controls="import">バックアップから復元<\/button>/);
  assert.match(html, /<input type="file" id="import" accept="application\/json,\.json"/);
  const {get,exports}=app();
  get('export').onclick();
  assert.equal(exports.downloads[0].filename,'life125-backup.json');
  assert.match(get('message').textContent,/バックアップのダウンロードを開始しました/);
});

test('family timeline shows a named pet and changes ages when the year slider moves', () => {
  const {get}=app();
  get('familyName').value='ロッキー';
  get('familyRole').value='ペット';
  get('familyBirth').value='2018-05-03';
  get('addFamily').onclick();
  get('timelineYear').value='2030';
  get('timelineYear').oninput();
  assert.equal(get('timelineYearLabel').textContent,'2030年');
  assert.match(get('timelineAges').innerHTML,/ロッキー：12歳/);
  assert.match(get('timelineAges').innerHTML,/本人：40歳/);
});
test('family timeline shows matching events and escapes untrusted text', () => {
  const {get}=app();
  get('eventDate').value='2030-04-01';
  get('eventTitle').value='<img src=x>';
  get('eventAmount').value='0';
  get('addEvent').onclick();
  get('timelineYear').value='2030';
  get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/&lt;img src=x&gt;/);
  assert.doesNotMatch(get('timelineEvents').innerHTML,/<img/);
  get('timelineYear').value='2031';
  get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/登録イベントはありません/);
});
test('timeline keeps selected year within the current plan range', () => {
  const {get}=app();
  get('timelineYear').value='9999';
  get('timelineYear').oninput();
  assert.equal(get('timelineYear').value,get('timelineYear').max);
});

test('timeline starts at the user birth year and can show early life', () => {
  const {get}=app();
  assert.equal(get('timelineYear').min,'1990');
  get('timelineYear').value='1990';
  get('timelineYear').oninput();
  assert.equal(get('timelineYearLabel').textContent,'1990年');
  assert.match(get('timelineAges').innerHTML,/本人：0歳/);
});

test('older family member expands timeline into the past', () => {
  const {get}=app();
  get('familyName').value='祖父';
  get('familyRole').value='家族';
  get('familyBirth').value='1950-06-01';
  get('addFamily').onclick();
  assert.equal(get('timelineYear').min,'1950');
  get('timelineYear').value='1955';
  get('timelineYear').oninput();
  assert.match(get('timelineAges').innerHTML,/祖父：5歳/);
  assert.match(get('timelineAges').innerHTML,/本人：誕生前/);
});

test('past chronicle extends timeline and deleting it clamps selected year', () => {
  const {get}=app();
  get('eventDate').value='1960-04-01';
  get('eventTitle').value='家族の思い出';
  get('eventType').value='past';
  get('eventRepeat').value='once';
  get('eventAmount').value='0';
  get('addEvent').onclick();
  assert.equal(get('timelineYear').min,'1960');
  get('timelineYear').value='1960';
  get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/家族の思い出/);
  assert.match(get('timelineEvents').innerHTML,/記録/);
  get('eventRows').onclick({target:{dataset:{event:'0'}}});
  assert.equal(get('timelineYear').min,'1990');
  assert.equal(get('timelineYear').value,'1990');
});


test('light trails display registered pet names safely and follow selected year', () => {
  const {get}=app();
  get('familyName').value='<ロッキー>';
  get('familyRole').value='ペット';
  get('familyBirth').value='2018-05-03';
  get('addFamily').onclick();
  get('timelineYear').value='2030';
  get('timelineYear').oninput();
  const svg=get('timelineTrails').innerHTML;
  assert.match(svg,/class="life-trail"/);
  assert.match(svg,/&lt;ロッキー&gt;/);
  assert.doesNotMatch(svg,/<ロッキー>/);
  assert.match(svg,/aria-hidden="true"/);
});

test('light trails exclude people not yet born at selected year', () => {
  const {get}=app();
  get('familyName').value='ロッキー';
  get('familyRole').value='ペット';
  get('familyBirth').value='2018-05-03';
  get('addFamily').onclick();
  get('timelineYear').value='2000';
  get('timelineYear').oninput();
  assert.doesNotMatch(get('timelineTrails').innerHTML,/ロッキー/);
  get('timelineYear').value='2030';
  get('timelineYear').oninput();
  assert.match(get('timelineTrails').innerHTML,/ロッキー/);
});

test('light trails cap visual rendering at twelve people and support reduced motion', () => {
  const {get,restore,snapshot}=app();
  const backup=snapshot();
  backup.families=Array.from({length:15},(_,i)=>({name:'家族'+i,role:'家族',birth:'1980-01-01'}));
  restore(backup);
  get('timelineYear').value='2030';
  get('timelineYear').oninput();
  assert.equal((get('timelineTrails').innerHTML.match(/class="life-trail"/g)||[]).length,12);
  assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html,/\.life-trail\{animation:none;stroke-dashoffset:0\}/);
});


test('chronicle note appears safely in timeline and event list and survives backup', () => {
  const {get,snapshot,restore}=app();
  get('eventDate').value='2020-05-03';
  get('eventTitle').value='ロッキーとの出会い';
  get('eventType').value='past';
  get('eventNote').value='<img src=x onerror=alert(1)> 幸せだった';
  get('eventAmount').value='0';
  get('addEvent').onclick();
  const backup=snapshot();
  assert.equal(backup.events[0].note,'<img src=x onerror=alert(1)> 幸せだった');
  get('timelineYear').value='2020';
  get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(get('timelineEvents').innerHTML,/<img/);
  assert.doesNotMatch(get('eventRows').innerHTML,/<img/);
  restore(backup);
  assert.equal(snapshot().events[0].note,backup.events[0].note);
});

test('oversized note is rejected without adding event', () => {
  const {get,snapshot,alerts}=app();
  get('eventDate').value='2020-05-03';
  get('eventTitle').value='思い出';
  get('eventNote').value='あ'.repeat(501);
  get('eventAmount').value='0';
  get('addEvent').onclick();
  assert.equal(snapshot().events.length,0);
  assert.match(alerts.at(-1),/500文字以内/);
});

test('invalid note type and length in imported backup are rejected without mutation', () => {
  const {restore,snapshot}=app();
  const before=snapshot();
  for (const note of [42,'a'.repeat(501)]) {
    const bad=structuredClone(before);
    bad.events=[{date:'2020-05-03',title:'記録',type:'past',amount:0,repeat:'once',note}];
    assert.throws(()=>restore(bad),/イベントデータ/);
    assert.deepEqual(snapshot(),before);
  }
});

test('legacy backup without note remains compatible', () => {
  const {restore,snapshot}=app();
  const old=snapshot();
  old.events=[{date:'2020-05-03',title:'昔の記録',type:'past',amount:0,repeat:'once'}];
  restore(old);
  assert.deepEqual(snapshot().events,old.events);
});

test('linked pet memory appears on trail and survives backup safely', () => {
 const {get,snapshot,restore}=app();
 get('familyName').value='<ロッキー>';get('familyRole').value='ペット';get('familyBirth').value='2018-05-03';get('addFamily').onclick();
 get('eventDate').value='2020-05-03';get('eventTitle').value='<出会い>';get('eventType').value='past';get('eventAmount').value='0';get('eventPerson').value='legacy:0';get('eventNote').value='幸せ';get('addEvent').onclick();
 const backup=snapshot();assert.equal(backup.families[0].id,'f1');assert.equal(backup.events[0].personId,'f1');
 get('timelineYear').value='2020';get('timelineYear').oninput();
 assert.match(get('timelineTrails').innerHTML,/life-event-marker/);assert.match(get('timelineTrails').innerHTML,/&lt;出会い&gt;/);
 assert.match(get('timelineEvents').innerHTML,/&lt;ロッキー&gt;/);
 restore(backup);assert.equal(snapshot().events[0].personId,'f1');
});
test('self-linked event needs no family registration', () => {
 const {get,snapshot}=app();get('eventDate').value='2020-01-01';get('eventTitle').value='節目';get('eventAmount').value='0';get('eventPerson').value='self';get('addEvent').onclick();
 assert.equal(snapshot().events[0].personId,'self');get('timelineYear').value='2020';get('timelineYear').oninput();assert.match(get('timelineEvents').innerHTML,/関連：本人/);
});
test('invalid event person reference and duplicate family IDs reject backup', () => {
 const {restore,snapshot}=app(),before=snapshot(),bad=structuredClone(before);
 bad.events=[{date:'2020-05-03',title:'記録',type:'past',amount:0,repeat:'once',personId:'f99'}];assert.throws(()=>restore(bad),/イベントデータ/);
 const dup=structuredClone(before);dup.families=[{id:'f1',name:'A',role:'家族',birth:'1990-01-01'},{id:'f1',name:'B',role:'家族',birth:'1990-01-01'}];assert.throws(()=>restore(dup),/家族ID/);
 assert.deepEqual(snapshot(),before);
});
test('deleting family unlinks memory without deleting note', () => {
 const {get,snapshot}=app();get('familyName').value='ロッキー';get('familyRole').value='ペット';get('familyBirth').value='2018-05-03';get('addFamily').onclick();
 get('eventDate').value='2020-05-03';get('eventTitle').value='出会い';get('eventType').value='past';get('eventAmount').value='0';get('eventNote').value='大切';get('eventPerson').value='legacy:0';get('addEvent').onclick();
 get('familyList').onclick({target:{dataset:{family:'0'}}});assert.equal(snapshot().families.length,0);assert.equal(snapshot().events[0].personId,undefined);assert.equal(snapshot().events[0].note,'大切');
});

test('two-person encounter draws explicit crossing connector and restores safely', () => {
 const {get,snapshot,restore}=app();
 for(const [name,birth] of [['親友','1990-01-01'],['ロッキー','2018-05-03']]){
  get('familyName').value=name;get('familyRole').value='友人・ペット';get('familyBirth').value=birth;get('addFamily').onclick();
 }
 get('eventDate').value='2020-05-03';get('eventTitle').value='<出会い>';get('eventType').value='past';get('eventAmount').value='0';
 get('eventPerson').value='legacy:0';get('eventPerson2').value='legacy:1';get('addEvent').onclick();
 const saved=snapshot();assert.equal(saved.events[0].personId,'f1');assert.equal(saved.events[0].secondPersonId,'f2');
 get('timelineYear').value='2020';get('timelineYear').oninput();
 assert.match(get('timelineTrails').innerHTML,/class="life-connection"/);
 assert.match(get('timelineTrails').innerHTML,/&lt;出会い&gt;/);
 assert.match(get('timelineEvents').innerHTML,/親友・ロッキー/);
 restore(saved);assert.equal(snapshot().events[0].secondPersonId,'f2');
});
test('second person without first or duplicate person is rejected', () => {
 const {get,snapshot,alerts}=app();
 get('eventDate').value='2020-05-03';get('eventTitle').value='再会';get('eventAmount').value='0';
 get('eventPerson2').value='self';get('addEvent').onclick();
 assert.equal(snapshot().events.length,0);assert.match(alerts.at(-1),/関連する人/);
 get('eventPerson').value='self';get('addEvent').onclick();
 assert.equal(snapshot().events.length,0);assert.match(alerts.at(-1),/異なる2人/);
});
test('invalid or duplicate second-person backup reference rejects atomically', () => {
 const {restore,snapshot}=app(),before=snapshot();
 for(const secondPersonId of ['f99','self']){
  const bad=structuredClone(before);
  bad.events=[{date:'2020-01-01',title:'出会い',type:'past',amount:0,repeat:'once',personId:'self',secondPersonId}];
  assert.throws(()=>restore(bad),/イベントデータ/);assert.deepEqual(snapshot(),before);
 }
});
test('deleting first linked person preserves memory and promotes second person', () => {
 const {get,snapshot}=app();
 for(const name of ['親友','ロッキー']){get('familyName').value=name;get('familyRole').value='友人';get('familyBirth').value='2000-01-01';get('addFamily').onclick()}
 get('eventDate').value='2020-05-03';get('eventTitle').value='再会';get('eventAmount').value='0';get('eventNote').value='大切な日';
 get('eventPerson').value='legacy:0';get('eventPerson2').value='legacy:1';get('addEvent').onclick();
 get('familyList').onclick({target:{dataset:{family:'0'}}});
 assert.equal(snapshot().events[0].personId,'f2');assert.equal(snapshot().events[0].secondPersonId,undefined);
 assert.equal(snapshot().events[0].note,'大切な日');
});


test('timeline year step buttons move exactly one year without changing saved data', () => {
 const {get,snapshot}=app(),before=snapshot();
 get('timelineYear').value='2030';get('timelineYear').oninput();
 get('timelinePrev').onclick();
 assert.equal(get('timelineYear').value,'2029');
 assert.equal(get('timelineYearLabel').textContent,'2029年');
 get('timelineNext').onclick();
 assert.equal(get('timelineYear').value,'2030');
 assert.deepEqual(snapshot(),before);
});

test('timeline year step buttons respect minimum and maximum years', () => {
 const {get}=app(),slider=get('timelineYear');
 slider.value=slider.min;slider.oninput();
 assert.equal(get('timelinePrev').disabled,true);
 get('timelinePrev').onclick();assert.equal(slider.value,slider.min);
 slider.value=slider.max;slider.oninput();
 assert.equal(get('timelineNext').disabled,true);
 get('timelineNext').onclick();assert.equal(slider.value,slider.max);
 get('timelinePrev').onclick();assert.equal(get('timelineNext').disabled,false);
});

test('timeline step controls stay usable after adding and deleting older events', () => {
 const {get}=app();
 get('eventDate').value='1960-04-01';get('eventTitle').value='昔の思い出';
 get('eventType').value='past';get('eventAmount').value='0';get('addEvent').onclick();
 assert.equal(get('timelineYear').min,'1960');
 get('timelineYear').value='1960';get('timelineYear').oninput();
 get('timelineNext').onclick();assert.equal(get('timelineYear').value,'1961');
 get('eventRows').onclick({target:{dataset:{event:'0'}}});
 assert.equal(get('timelineYear').min,'1990');
 assert.equal(get('timelineYear').value,'1990');
 assert.equal(get('timelinePrev').disabled,true);
});

test('timeline year buttons are explicitly accessible and never submit forms', () => {
 assert.match(html,/id="timelinePrev" aria-controls="timelineYear">← 前年<\/button>/);
 assert.match(html,/id="timelineNext" aria-controls="timelineYear">翌年 →<\/button>/);
 assert.match(html,/type="button" class="secondary" id="timelinePrev"/);
 assert.match(html,/type="button" class="secondary" id="timelineNext"/);
});

test('cancelled backup export does not create or download personal data', () => {
  const {get,exports,snapshot,setCanExport}=app();
  const before=snapshot();
  setCanExport(false);
  get('export').onclick();
  assert.equal(exports.downloads.length,0);
  assert.equal(exports.exportBlobs.length,0);
  assert.deepEqual(exports.revoked,[]);
  assert.deepEqual(snapshot(),before);
  assert.match(get('message').textContent,/取り消しました/);
});

test('backup warning explicitly describes unencrypted personal data', () => {
  assert.match(html,/バックアップファイルは暗号化されず/);
  assert.match(html,/呼び名・生年月日・思い出・資産情報/);
  assert.match(html,/confirm\('バックアップには名前・生年月日・思い出・資産情報が含まれ、暗号化されません/);
});

test('consented backup export retains existing JSON format and filename', () => {
  const {get,exports,setCanExport}=app();
  setCanExport(true);
  get('export').onclick();
  assert.equal(exports.downloads.length,1);
  assert.equal(exports.downloads[0].filename,'life125-backup.json');
  assert.equal(JSON.parse(exports.exportBlobs[0].content).version,1);
});


test('cancelled device restore preserves unsaved screen data', () => {
 const {get,storage,snapshot,setCanRestore}=app();
 const saved=snapshot();saved.fields.salary='88';storage.getItem=()=>JSON.stringify(saved);
 get('salary').value='33';const before=snapshot();setCanRestore(false);
 get('load').onclick();
 assert.deepEqual(snapshot(),before);
 assert.match(get('message').textContent,/復元を取り消しました/);
});

test('approved device restore replaces screen data', () => {
 const {get,storage,snapshot,setCanRestore}=app();
 const saved=snapshot();saved.fields.salary='88';storage.getItem=()=>JSON.stringify(saved);
 get('salary').value='33';setCanRestore(true);get('load').onclick();
 assert.equal(snapshot().fields.salary,'88');
 assert.match(get('message').textContent,/端末の保存を復元しました/);
});

test('cancelled file restore preserves unsaved screen data', async () => {
 const {get,importFile,snapshot,setCanRestore}=app();
 const saved=snapshot();saved.fields.salary='88';
 get('salary').value='33';const before=snapshot();setCanRestore(false);
 await importFile({size:100,text:async()=>JSON.stringify(saved)});
 assert.deepEqual(snapshot(),before);
 assert.match(get('message').textContent,/復元を取り消しました/);
});

test('approved file restore retains version 1 compatibility', async () => {
 const {get,importFile,snapshot,setCanRestore}=app();
 const saved=snapshot();saved.fields.salary='88';
 get('salary').value='33';setCanRestore(true);
 await importFile({size:100,text:async()=>JSON.stringify(saved)});
 assert.equal(snapshot().fields.salary,'88');
 assert.equal(snapshot().version,1);
 assert.match(get('message').textContent,/バックアップから復元しました/);
});


test('cancelled person deletion preserves the person and linked memories', () => {
 const {get,snapshot,setCanClear}=app();
 get('familyName').value='ロッキー';get('familyRole').value='ペット';get('familyBirth').value='2018-05-03';get('addFamily').onclick();
 get('eventDate').value='2020-05-03';get('eventTitle').value='出会い';get('eventType').value='past';
 get('eventAmount').value='0';get('eventNote').value='大切な思い出';get('eventPerson').value='legacy:0';get('addEvent').onclick();
 const before=snapshot();setCanClear(false);
 get('familyList').onclick({target:{dataset:{family:'0'}}});
 assert.deepEqual(snapshot(),before);
 assert.match(get('familyList').innerHTML,/ロッキー/);
});

test('cancelled event deletion preserves the full memory including note', () => {
 const {get,snapshot,setCanClear}=app();
 get('eventDate').value='2020-05-03';get('eventTitle').value='再会';
 get('eventType').value='past';get('eventAmount').value='0';get('eventNote').value='忘れない';
 get('addEvent').onclick();
 const before=snapshot();setCanClear(false);
 get('eventRows').onclick({target:{dataset:{event:'0'}}});
 assert.deepEqual(snapshot(),before);
 assert.match(get('eventRows').innerHTML,/忘れない/);
});

test('confirmed event deletion removes only the selected memory', () => {
 const {get,snapshot,setCanClear}=app();
 for(const title of ['残す思い出','削除する思い出']){
  get('eventDate').value='2020-05-03';get('eventTitle').value=title;
  get('eventType').value='past';get('eventAmount').value='0';get('addEvent').onclick();
 }
 setCanClear(true);
 get('eventRows').onclick({target:{dataset:{event:'1'}}});
 assert.deepEqual(snapshot().events.map(e=>e.title),['残す思い出']);
});

test('invalid deletion indices cannot remove people or memories', () => {
 const {get,snapshot}=app();
 get('familyName').value='家族';get('familyRole').value='家族';get('familyBirth').value='1990-01-01';get('addFamily').onclick();
 get('eventDate').value='2020-01-01';get('eventTitle').value='記録';get('eventAmount').value='0';get('addEvent').onclick();
 const before=snapshot();
 for(const index of ['NaN','-1','99']){
  get('familyList').onclick({target:{dataset:{family:index}}});
  get('eventRows').onclick({target:{dataset:{event:index}}});
 }
 assert.deepEqual(snapshot(),before);
});

test('JSON restore is a keyboard-focusable native button, not a hidden-label-only control', () => {
  assert.match(html, /<button type="button" class="secondary" id="importButton"/);
  assert.match(html, /id="importButton" aria-controls="import"/);
  assert.match(html, /<input type="file" id="import"[^>]*aria-label="復元するJSONバックアップを選択"/);
  assert.doesNotMatch(html, /<label class="button"[^>]*>バックアップから復元/);
});

test('restore button opens the file picker without changing personal data until selection', () => {
  const {get,snapshot}=app();
  const before=snapshot();
  let opened=0;
  get('import').click=()=>{opened++};
  get('importButton').onclick();
  assert.equal(opened,1);
  assert.deepEqual(snapshot(),before);
});


test('direct year input is a labelled native number field', () => {
  assert.match(html, /<label for="timelineJump">表示年を直接指定（年）<\/label>/);
  assert.match(html, /id="timelineJump" type="number" step="1" inputmode="numeric" aria-controls="timelineYear"/);
});

test('direct year jump updates slider and family timeline without changing saved data', () => {
  const {get,snapshot}=app();
  const before=snapshot();
  get('timelineJump').value='2050';
  get('timelineJump').onchange();
  assert.equal(get('timelineYear').value,'2050');
  assert.equal(get('timelineYearLabel').textContent,'2050年');
  assert.equal(get('timelineJump').value,'2050');
  assert.deepEqual(snapshot(),before);
});

test('direct year jump clamps both ends of the timeline', () => {
  const {get}=app();
  const slider=get('timelineYear'),jump=get('timelineJump');
  jump.value='1800';jump.onchange();
  assert.equal(slider.value,slider.min);
  assert.equal(jump.value,slider.min);
  jump.value='9999';jump.onchange();
  assert.equal(slider.value,slider.max);
  assert.equal(jump.value,slider.max);
});

test('invalid direct year restores the current year and slider stays synchronized', () => {
  const {get}=app();
  const slider=get('timelineYear'),jump=get('timelineJump');
  slider.value='2044';slider.oninput();
  assert.equal(jump.value,'2044');
  for(const invalid of ['', '2040.5', 'abc']){
    jump.value=invalid;jump.onchange();
    assert.equal(slider.value,'2044');
    assert.equal(jump.value,'2044');
    assert.match(get('message').textContent,/整数/);
  }
});

test('annual timeline events are ordered by occurrence month, not original registration year', () => {
 const {get,snapshot}=app();
 for(const [date,title,repeat] of [
  ['2020-12-01','冬の再会','annual'],
  ['2024-02-02','春の約束','annual'],
  ['2030-06-15','一度きりの旅','once']
 ]){
  get('eventDate').value=date;get('eventTitle').value=title;
  get('eventAmount').value='0';get('eventRepeat').value=repeat;
  get('addEvent').onclick();
 }
 const before=snapshot();
 get('timelineYear').value='2030';get('timelineYear').oninput();
 const shown=get('timelineEvents').innerHTML;
 assert.ok(shown.indexOf('春の約束')<shown.indexOf('一度きりの旅'));
 assert.ok(shown.indexOf('一度きりの旅')<shown.indexOf('冬の再会'));
 assert.match(shown,/2030年02月02日：春の約束（毎年）/);
 assert.match(shown,/2030年06月15日：一度きりの旅/);
 assert.match(shown,/2030年12月01日：冬の再会（毎年）/);
 assert.deepEqual(snapshot(),before);
});

test('annual occurrence date follows the selected year and excludes future-starting events', () => {
 const {get}=app();
 get('eventDate').value='2040-05-03';get('eventTitle').value='毎年の記念日';
 get('eventAmount').value='0';get('eventRepeat').value='annual';get('addEvent').onclick();
 get('timelineYear').value='2039';get('timelineYear').oninput();
 assert.doesNotMatch(get('timelineEvents').innerHTML,/毎年の記念日/);
 get('timelineYear').value='2041';get('timelineYear').oninput();
 assert.match(get('timelineEvents').innerHTML,/2041年05月03日：毎年の記念日（毎年）/);
});

test('deleting device storage keeps current screen data and explicitly warns about retained backups', () => {
  const {get,storage,clear,snapshot}=app();
  get('name').value='テスト用の呼び名';
  get('salary').value='37';
  const before=snapshot();
  const removed=[];
  storage.removeItem=key=>removed.push(key);
  clear();
  assert.deepEqual(removed,['softazio-life125-v1']);
  assert.deepEqual(snapshot(),before);
  assert.match(get('message').textContent,/端末内の保存データを削除しました/);
  assert.match(get('message').textContent,/画面の入力内容とダウンロード済みバックアップは残っています/);
});

test('deletion instructions state that removing browser storage does not erase visible or downloaded data', () => {
  assert.match(html,/「保存データを削除」は端末内の保存分だけを消し/);
  assert.match(html,/画面に表示中の入力内容やダウンロード済みバックアップは消しません/);
  assert.match(html,/confirm\('この端末に保存したLIFE 125のデータを削除しますか？画面の入力内容とダウンロード済みバックアップは残ります。'\)/);
});

test('saving sensitive LIFE 125 data requires explicit device-storage consent', () => {
  assert.match(html,/confirm\('この端末に家族の呼び名・生年月日・思い出・資産情報を保存します。共用端末では保存を避けてください。保存しますか？'\)/);
});

test('cancelled device save never writes personal data to localStorage', () => {
  const {get,storage,setCanSave,snapshot}=app();
  let writes=0;
  storage.setItem=()=>{writes++};
  const before=snapshot();
  setCanSave(false);
  get('save').onclick();
  assert.equal(writes,0);
  assert.deepEqual(snapshot(),before);
  assert.match(get('message').textContent,/保存を取り消しました/);
});

test('confirmed device save still preserves the version 1 backup format', () => {
  const {get,storage,setCanSave}=app();
  let key, data;
  storage.setItem=(k,v)=>{key=k;data=JSON.parse(v)};
  setCanSave(true);
  get('save').onclick();
  assert.equal(key,'softazio-life125-v1');
  assert.equal(data.version,1);
  assert.equal(data.fields.salary,'20');
  assert.match(get('message').textContent,/保存しました/);
});

test('family deletion control identifies the person and escapes markup in its accessible name', () => {
  const {get}=app();
  get('familyName').value='ロッキー " <友>';
  get('familyRole').value='ペット';
  get('familyBirth').value='2018-05-03';
  get('addFamily').onclick();
  const markup=get('familyList').innerHTML;
  assert.match(markup,/data-family="0" aria-label="「ロッキー &quot; &lt;友&gt;」を削除"/);
  assert.doesNotMatch(markup,/aria-label="[^"]*<友>/);
});

test('event deletion control identifies title and date without unsafe HTML attributes', () => {
  const {get}=app();
  get('eventDate').value='2030-04-01';
  get('eventTitle').value='旅行 " <同行>';
  get('eventAmount').value='0';
  get('addEvent').onclick();
  const markup=get('eventRows').innerHTML;
  assert.match(markup,/data-event="0" aria-label="「旅行 &quot; &lt;同行&gt;」（2030-04-01）を削除"/);
  assert.doesNotMatch(markup,/aria-label="[^"]*<同行>/);
});

test('failed restore preserves the selected past chronicle year after temporary range shrink', () => {
  const {get,restore,snapshot}=app();
  get('eventDate').value='1950-04-01';
  get('eventTitle').value='家族の昔の記録';
  get('eventType').value='past';
  get('eventAmount').value='0';
  get('addEvent').onclick();
  get('timelineYear').value='1950';
  get('timelineYear').oninput();
  const before=snapshot(),invalid=structuredClone(before);
  invalid.fields.birth='2000-01-01';
  invalid.fields.wageGrowth='-200';
  invalid.events=[];
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.equal(get('timelineYear').value,'1950');
  assert.equal(get('timelineJump').value,'1950');
  assert.equal(get('timelineYearLabel').textContent,'1950年');
  assert.match(get('timelineEvents').innerHTML,/家族の昔の記録/);
});

test('failed restore preserves a selected future year when temporary plan ends earlier', () => {
  const {get,restore,snapshot}=app();
  get('timelineYear').value='2080';
  get('timelineYear').oninput();
  const before=snapshot(),invalid=structuredClone(before);
  invalid.fields.endAge='50';
  invalid.fields.wageGrowth='-200';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.equal(get('timelineYear').value,'2080');
  assert.equal(get('timelineJump').value,'2080');
  assert.equal(get('timelineYearLabel').textContent,'2080年');
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('keyboard focus has a visible high-contrast indicator on interactive controls', () => {
  assert.ok(html.includes(':where(a,button,input,select,textarea,summary,.scroll):focus-visible{outline:3px solid #145a8d;outline-offset:3px;box-shadow:0 0 0 5px #fff}'));
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
});

test('out-of-range direct year reports the actual displayed range for both ends', () => {
  const {get,snapshot}=app();
  const before=snapshot(),slider=get('timelineYear'),jump=get('timelineJump');
  jump.value='1800';jump.onchange();
  assert.equal(jump.value,slider.min);
  assert.match(get('message').textContent,/指定年は表示範囲外のため/);
  assert.ok(get('message').textContent.includes(slider.min+'〜'+slider.max+'年'));
  jump.value='9999';jump.onchange();
  assert.equal(jump.value,slider.max);
  assert.match(get('message').textContent,/指定年は表示範囲外のため/);
  assert.deepEqual(snapshot(),before);
});

test('valid direct year does not announce a false range adjustment', () => {
  const {get}=app();
  const jump=get('timelineJump');
  get('message').textContent='以前の通知';
  jump.value='2050';jump.onchange();
  assert.equal(get('timelineYear').value,'2050');
  assert.equal(get('message').textContent,'以前の通知');
});


test('already-passed final birthday month rejects an empty projection without crashing', () => {
  const {get,calculate}=app();
  const now=new Date(),currentMonth=now.getMonth()+1;
  if(currentMonth===1)return; // January has no earlier birthday month in the same year.
  get('birth').value=(now.getFullYear()-65)+'-01-01';
  get('endAge').value='65';
  assert.equal(calculate(),false);
  assert.equal(get('stats').innerHTML,'');
  assert.equal(get('yearRows').innerHTML,'');
  assert.match(get('message').textContent,/到達月は既に過ぎています/);
  get('endAge').value='66';
  assert.equal(calculate(),true);
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('final birthday month equal to the current month remains a valid one-month projection', () => {
  const {get,calculate}=app();
  const now=new Date(),month=String(now.getMonth()+1).padStart(2,'0');
  get('birth').value=(now.getFullYear()-65)+'-'+month+'-01';
  get('endAge').value='65';
  assert.equal(calculate(),true);
  assert.match(get('yearRows').innerHTML,new RegExp('<tr><td>'+now.getFullYear()+'</td>'));
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('timeline labels distinguish expenses, income, zero-cost events and excluded past records', () => {
  const {get,snapshot}=app();
  for(const [date,title,amount,type] of [
    ['2030-04-02','家族旅行','-12.5','future'],
    ['2030-06-10','臨時収入','8','future'],
    ['2030-07-01','無料の記念日','0','future'],
    ['2030-08-01','昔の記録','-99','past']
  ]){
    get('eventDate').value=date;get('eventTitle').value=title;
    get('eventAmount').value=amount;get('eventType').value=type;
    get('eventRepeat').value='once';get('addEvent').onclick();
  }
  const before=snapshot();
  get('timelineYear').value='2030';get('timelineYear').oninput();
  const shown=get('timelineEvents').innerHTML;
  assert.match(shown,/家族旅行 — 予定（支出 12\.5万円）/);
  assert.match(shown,/臨時収入 — 予定（収入 8万円）/);
  assert.match(shown,/無料の記念日 — 予定<\/li>/);
  assert.match(shown,/昔の記録 — 記録（試算対象外）/);
  assert.doesNotMatch(shown,/昔の記録[^<]*支出/);
  assert.deepEqual(snapshot(),before);
});

test('annual future expense appears in the selected year with its cash-flow label', () => {
  const {get,snapshot}=app();
  get('eventDate').value='2028-02-05';
  get('eventTitle').value='年会費';
  get('eventAmount').value='-3';
  get('eventType').value='future';
  get('eventRepeat').value='annual';
  get('addEvent').onclick();
  const before=snapshot();
  get('timelineYear').value='2032';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/2032年02月05日：年会費（毎年） — 予定（支出 3万円）/);
  assert.deepEqual(snapshot(),before);
});


test('past chronicle rows explicitly identify amounts excluded from asset projections', () => {
  const {get,calculate}=app();
  const original=get('yearRows').innerHTML;
  get('eventDate').value='2030-04-01';
  get('eventTitle').value='過去の記録';
  get('eventType').value='past';
  get('eventAmount').value='-9999';
  get('eventRepeat').value='once';
  get('addEvent').onclick();
  assert.match(get('eventRows').innerHTML,/過去（試算対象外）/);
  assert.match(get('eventRows').innerHTML,/-9999\.0/);
  assert.equal(calculate(),true);
  assert.equal(get('yearRows').innerHTML,original);
});

test('future event rows keep the normal future label after exclusion clarification', () => {
  const {get}=app();
  get('eventDate').value='2030-04-01';
  get('eventTitle').value='将来の旅行';
  get('eventType').value='future';
  get('eventAmount').value='-12.5';
  get('addEvent').onclick();
  const markup=get('eventRows').innerHTML;
  assert.match(markup,/-12\.5/);
  assert.match(markup,/<td>将来<\/td>/);
  assert.doesNotMatch(markup,/試算対象外/);
});


test('both horizontally scrollable data tables are keyboard-focusable labelled regions', () => {
  assert.match(html, /<div class="scroll" tabindex="0" role="region" aria-label="イベント一覧（横スクロール可能）"><table>/);
  assert.match(html, /<div class="scroll" tabindex="0" role="region" aria-label="年次資産推移表（横スクロール可能）"><table>/);
});

test('keyboard focus indicator also covers scrollable table regions', () => {
  assert.ok(html.includes(':where(a,button,input,select,textarea,summary,.scroll):focus-visible{outline:3px solid #145a8d'));
});

test('empty event table explains how to add the first event', () => {
  const {get,snapshot}=app();
  assert.match(get('eventRows').innerHTML,/<td colspan="5" class="muted">イベントはまだ登録されていません/);
  assert.equal(snapshot().events.length,0);
});

test('empty event hint disappears on add and returns after deletion', () => {
  const {get,snapshot}=app();
  get('eventDate').value='2030-04-01';
  get('eventTitle').value='家族旅行';
  get('eventAmount').value='-5';
  get('addEvent').onclick();
  assert.equal(snapshot().events.length,1);
  assert.match(get('eventRows').innerHTML,/家族旅行/);
  assert.doesNotMatch(get('eventRows').innerHTML,/イベントはまだ登録されていません/);
  get('eventRows').onclick({target:{dataset:{event:'0'}}});
  assert.equal(snapshot().events.length,0);
  assert.match(get('eventRows').innerHTML,/イベントはまだ登録されていません/);
});

test('restored event amounts display their entered precision rather than rounding to one decimal', () => {
  const {get,restore,snapshot}=app();
  const backup=snapshot();
  backup.events=[
    {date:'2030-04-01',title:'細かな支出',type:'future',amount:-12.55,repeat:'once'},
    {date:'2030-04-02',title:'臨時収入',type:'future',amount:1234.567,repeat:'once'}
  ];
  restore(backup);
  const rows=get('eventRows').innerHTML;
  assert.match(rows,/<td>-12\.55<\/td>/);
  assert.match(rows,/<td>1,234\.567<\/td>/);
  assert.deepEqual(snapshot().events,backup.events);
});

test('event list labels its amount unit and preserves zero and small decimal amounts', () => {
  const {get,restore,snapshot}=app();
  const backup=snapshot();
  backup.events=[
    {date:'2030-04-01',title:'無料の行事',type:'future',amount:0,repeat:'once'},
    {date:'2030-04-02',title:'小さな収入',type:'future',amount:0.05,repeat:'once'}
  ];
  restore(backup);
  assert.match(html, /<th>収支（万円）<\/th>/);
  assert.match(get('eventRows').innerHTML,/<td>0<\/td>/);
  assert.match(get('eventRows').innerHTML,/<td>0\.05<\/td>/);
  assert.deepEqual(snapshot().events,backup.events);
});
