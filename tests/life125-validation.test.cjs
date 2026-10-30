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
    expense:'18', retireAge:'65', pensionAge:'65', pension:'12', invest:'0',
    contribution:'2', withdraw:'0', returnRate:'3', inflation:'2',
    wageGrowth:'0', debt:'0', debtRate:'0', repayment:'0'
  };
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {value:defaults[id]??'',innerHTML:'',textContent:'',dataset:{}});
    return elements.get(id);
  };
  let canClear = true;
  const storage = {removeItem:()=>{}};
  const alerts=[];
  const downloads=[], revoked=[], exportBlobs=[];
  let exportFailure=null;
  const context = vm.createContext({
    document:{getElementById:get,createElement:()=>({click(){
      if(exportFailure==='click')throw Error('download blocked');
      downloads.push({href:this.href,filename:this.download});
    }})},
    localStorage:storage,confirm:()=>canClear,alert:message=>alerts.push(message),
    Blob:class {constructor(parts,options){this.content=parts.join('');this.options=options;exportBlobs.push(this)}},
    URL:{createObjectURL:()=>{if(exportFailure==='url')throw Error('object URL blocked');return 'blob:life125-test'},
         revokeObjectURL:url=>revoked.push(url)},
    setTimeout:callback=>callback()
  });
  vm.runInContext(script, context, {timeout:3000});
  const importFile=async file=>{const input=get('import');input.files=file?[file]:[];input.value='life125-backup.json';await input.onchange({target:input});return input};
  return {importFile,get, alerts, storage, exports:{downloads,revoked,exportBlobs,setFailure:v=>{exportFailure=v}}, clear:()=>get('clear').onclick(), setCanClear:v=>{canClear=v}, calculate:()=>vm.runInContext('calculate()', context, {timeout:3000}), restore:data=>{context.__backup=data;vm.runInContext('restore(__backup)',context,{timeout:3000})}, snapshot:()=>JSON.parse(vm.runInContext('JSON.stringify(snapshot())',context,{timeout:3000}))};
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
  assert.match(html, /バックアップから復元<input type="file" id="import"/);
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
