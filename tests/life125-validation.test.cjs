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
  const alerts=[],confirmMessages=[];
  const downloads=[], revoked=[], exportBlobs=[];
  let exportFailure=null;
  const context = vm.createContext({
    document:{getElementById:get,createElement:()=>({click(){
      if(exportFailure==='click')throw Error('download blocked');
      downloads.push({href:this.href,filename:this.download});
    }})},
    localStorage:storage,confirm:message=>{confirmMessages.push(message);return message.includes('この端末に家族の呼び名')?canSave:message.includes('バックアップには')?canExport:message.includes('復元すると')?canRestore:canClear},alert:message=>alerts.push(message),
    Blob:class {constructor(parts,options){this.content=parts.join('');this.options=options;exportBlobs.push(this)}},
    URL:{createObjectURL:()=>{if(exportFailure==='url')throw Error('object URL blocked');return 'blob:life125-test'},
         revokeObjectURL:url=>revoked.push(url)},
    setTimeout:callback=>callback()
  });
  vm.runInContext(script, context, {timeout:3000});
  const importFile=async file=>{const input=get('import');input.files=file?[file]:[];input.value='life125-backup.json';await input.onchange({target:input});return input};
  return {importFile,get, alerts, confirmMessages, storage, exports:{downloads,revoked,exportBlobs,setFailure:v=>{exportFailure=v}}, clear:()=>get('clear').onclick(), setCanClear:v=>{canClear=v}, setCanSave:v=>{canSave=v}, setCanExport:v=>{canExport=v}, setCanRestore:v=>{canRestore=v}, calculate:()=>vm.runInContext('calculate()', context, {timeout:3000}), restore:data=>{context.__backup=data;vm.runInContext('restore(__backup)',context,{timeout:3000})}, snapshot:()=>JSON.parse(vm.runInContext('JSON.stringify(snapshot())',context,{timeout:3000}))};
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
  // 登録成功後は入力欄が空になるため、次の予定を明示して追加する。
  get('eventDate').value='2030-04-02';
  get('eventTitle').value='進学費用';
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
  for(let i=0;i<101;i++){
    get('familyName').value='家族';
    get('familyBirth').value='2000-01-01';
    get('addFamily').onclick();
  }
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
    ['2020-08-01','昔の記録','-99','past']
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
  get('timelineYear').value='2020';get('timelineYear').oninput();
  const pastShown=get('timelineEvents').innerHTML;
  assert.match(pastShown,/昔の記録 — 記録（試算対象外）/);
  assert.doesNotMatch(pastShown,/昔の記録[^<]*支出/);
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
  get('eventDate').value='2020-04-01';
  get('eventTitle').value='過去の記録';
  get('eventType').value='past';
  get('eventAmount').value='-9999';
  get('eventRepeat').value='once';
  get('addEvent').onclick();
  assert.match(get('eventRows').innerHTML,/過去（試算対象外）/);
  assert.match(get('eventRows').innerHTML,/<td>-9,999<\/td>/);
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


test('past-month one-off future event is visibly excluded without changing asset projection', () => {
  const {get,calculate}=app();
  const before=get('yearRows').innerHTML;
  get('eventDate').value='2000-04-01';
  get('eventTitle').value='過去月の一度きりの支出';
  get('eventType').value='future';
  get('eventRepeat').value='once';
  get('eventAmount').value='-50';
  get('addEvent').onclick();
  assert.match(get('eventRows').innerHTML,/予定（過去月・試算対象外）/);
  get('timelineYear').value='2000';
  get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/過去月の一度きりの支出[^<]*予定（支出 50万円）（過去月・試算対象外）/);
  assert.equal(calculate(),true);
  assert.equal(get('yearRows').innerHTML,before);
});

test('current-month and annual events remain eligible for future projection', () => {
  const {get}=app();
  const now=new Date();
  const currentMonth=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-01';
  for(const [date,title,repeat] of [
    [currentMonth,'今月の予定','once'],
    ['2000-01-01','毎年の記念日','annual']
  ]){
    get('eventDate').value=date;
    get('eventTitle').value=title;
    get('eventType').value='future';
    get('eventRepeat').value=repeat;
    get('eventAmount').value='-2';
    get('addEvent').onclick();
  }
  const rows=get('eventRows').innerHTML;
  assert.match(rows,/今月の予定/);
  assert.match(rows,/毎年の記念日（毎年）/);
  assert.doesNotMatch(rows,/過去月・試算対象外/);
  assert.equal((rows.match(/<td>将来<\/td>/g)||[]).length,2);
});


test('event amount input permits decimals finer than 0.1万円', () => {
  assert.match(html, /id="eventAmount" type="number" step="any" value="0"/);
  assert.doesNotMatch(html, /id="eventAmount" type="number" step="0\.1"/);
});

test('new event preserves precise small expense and income amounts', () => {
  const {get,snapshot}=app();
  for (const [date,title,amount] of [
    ['2030-04-01','小額の支出','-0.025'],
    ['2030-04-02','小額の収入','0.05']
  ]) {
    get('eventDate').value=date;
    get('eventTitle').value=title;
    get('eventAmount').value=amount;
    get('addEvent').onclick();
  }
  assert.deepEqual(snapshot().events.map(e=>e.amount),[-0.025,0.05]);
  assert.match(get('eventRows').innerHTML,/<td>-0\.025<\/td>/);
  assert.match(get('eventRows').innerHTML,/<td>0\.05<\/td>/);
});

test('past-year annual occurrence is marked outside the future projection in timeline', () => {
  const {get,restore,snapshot}=app();
  const backup=snapshot();
  backup.events=[{date:'2000-02-05',title:'毎年の会費',type:'future',amount:-3,repeat:'annual'}];
  restore(backup);
  get('timelineYear').value='2000'; get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/2000年02月05日：毎年の会費（毎年） — 予定（支出 3万円）（過去月・試算対象外）/);
  assert.match(get('eventRows').innerHTML,/<td>将来<\/td>/);
});

test('future annual occurrence remains planned; past month in current year is excluded', () => {
  const {get,restore,snapshot}=app();
  const backup=snapshot();
  backup.events=[{date:'2000-01-05',title:'毎年の行事',type:'future',amount:-2,repeat:'annual'}];
  restore(backup);
  const futureYear=new Date().getFullYear()+2;
  get('timelineYear').value=String(futureYear); get('timelineYear').oninput();
  assert.ok(get('timelineEvents').innerHTML.includes(futureYear+'年01月05日：毎年の行事（毎年） — 予定（支出 2万円）'));
  assert.doesNotMatch(get('timelineEvents').innerHTML,/試算対象外/);
  if(new Date().getMonth()>0){
    get('timelineYear').value=String(new Date().getFullYear()); get('timelineYear').oninput();
    assert.match(get('timelineEvents').innerHTML,/毎年の行事（毎年） — 予定（支出 2万円）（過去月・試算対象外）/);
  }
});

test('restoration rejects a self nickname longer than the input limit without mutation', () => {
  const {restore,snapshot,get}=app();
  const before=snapshot();
  const invalid=structuredClone(before);
  invalid.fields.name='家'.repeat(61);
  invalid.fields.salary='35';
  assert.throws(()=>restore(invalid),/本人の呼び名/);
  assert.deepEqual(snapshot(),before);
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('restoration accepts a self nickname at the 60-character boundary', () => {
  const {restore,snapshot,get}=app();
  const valid=snapshot();
  valid.fields.name='家'.repeat(60);
  restore(valid);
  assert.equal(snapshot().fields.name,valid.fields.name);
  assert.match(get('timelineAges').innerHTML,/家{60}/);
  assert.match(html,/id="name" maxlength="60"/);
});


test('simulation explains that contributions continue despite negative cash', () => {
  assert.match(html, /現預金がマイナスになっても、設定した毎月の投資積立は自動停止せず/);
  assert.match(html, /現預金不足を借入で自動補填することもありません/);
  assert.match(html, /NISAの投資枠や拠出可能額の上限判定も行いません/);
});

test('cash shortfall does not silently stop contributions or create an automatic loan', () => {
  const {get,calculate}=app();
  for (const [id,value] of [
    ['cash','0'],['salary','0'],['expense','0'],['pension','0'],
    ['invest','0'],['contribution','2'],['withdraw','0'],
    ['returnRate','0'],['debt','0'],['debtRate','0'],['repayment','0']
  ]) get(id).value=value;
  assert.equal(calculate(),true);
  assert.match(get('stats').innerHTML,/現預金がマイナスになる時期/);
  assert.match(get('stats').innerHTML,/\d{4}年\d{1,2}月/);
  assert.match(get('yearRows').innerHTML,/<td>-\d+万円<\/td><td>\d+万円<\/td><td>0万円<\/td>/);
});


test('one-off event after the plan end month is labelled outside projection', () => {
  const {get,calculate,snapshot}=app();
  get('birth').value='1990-01-01';
  get('endAge').value='40';
  assert.equal(calculate(),true);
  const before=get('yearRows').innerHTML;
  get('eventDate').value='2030-02-01';
  get('eventTitle').value='計画終了後の旅行';
  get('eventType').value='future';
  get('eventRepeat').value='once';
  get('eventAmount').value='-99';
  get('addEvent').onclick();
  assert.match(get('eventRows').innerHTML,/計画終了後の旅行/);
  assert.match(get('eventRows').innerHTML,/予定（計画期間外・試算対象外）/);
  get('timelineYear').value='2030';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/計画終了後の旅行[^<]*予定（支出 99万円）（計画期間外・試算対象外）/);
  assert.equal(calculate(),true);
  assert.equal(get('yearRows').innerHTML,before);
  assert.equal(snapshot().events.length,1);
});

test('event in the plan end month remains included in projection', () => {
  const {get,calculate}=app();
  get('birth').value='1990-01-01';
  get('endAge').value='40';
  assert.equal(calculate(),true);
  const before=get('yearRows').innerHTML;
  get('eventDate').value='2030-01-01';
  get('eventTitle').value='計画終了月の予定';
  get('eventType').value='future';
  get('eventRepeat').value='once';
  get('eventAmount').value='-99';
  get('addEvent').onclick();
  assert.match(get('eventRows').innerHTML,/<td>将来<\/td>/);
  get('timelineYear').value='2030';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/計画終了月の予定[^<]*予定（支出 99万円）/);
  assert.doesNotMatch(get('timelineEvents').innerHTML,/計画期間外/);
  assert.equal(calculate(),true);
  assert.notEqual(get('yearRows').innerHTML,before);
});

test('annual event starting after the plan end month is excluded in list and timeline', () => {
  const {get,calculate}=app();
  get('birth').value='1990-01-01';
  get('endAge').value='40';
  assert.equal(calculate(),true);
  const before=get('yearRows').innerHTML;
  get('eventDate').value='2030-02-05';
  get('eventTitle').value='終了後からの毎年会費';
  get('eventType').value='future';
  get('eventRepeat').value='annual';
  get('eventAmount').value='-99';
  get('addEvent').onclick();
  assert.match(get('eventRows').innerHTML,/終了後からの毎年会費（毎年）/);
  assert.match(get('eventRows').innerHTML,/予定（計画期間外・試算対象外）/);
  get('timelineYear').value='2030';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/2030年02月05日：終了後からの毎年会費（毎年） — 予定（支出 99万円）（計画期間外・試算対象外）/);
  assert.equal(calculate(),true);
  assert.equal(get('yearRows').innerHTML,before);
});

test('annual occurrence in the plan end month remains eligible', () => {
  const {get,calculate}=app();
  get('birth').value='1990-01-01';
  get('endAge').value='40';
  assert.equal(calculate(),true);
  const before=get('yearRows').innerHTML;
  get('eventDate').value='2030-01-05';
  get('eventTitle').value='終了月の毎年会費';
  get('eventType').value='future';
  get('eventRepeat').value='annual';
  get('eventAmount').value='-99';
  get('addEvent').onclick();
  assert.match(get('eventRows').innerHTML,/<td>将来<\/td>/);
  get('timelineYear').value='2030';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/2030年01月05日：終了月の毎年会費（毎年） — 予定（支出 99万円）/);
  assert.doesNotMatch(get('timelineEvents').innerHTML,/計画期間外/);
  assert.equal(calculate(),true);
  assert.notEqual(get('yearRows').innerHTML,before);
});


test('changing plan end age immediately refreshes event list status', () => {
  const {get}=app();
  get('endAge').value='40';get('endAge').oninput();
  get('eventDate').value='2030-02-01';
  get('eventTitle').value='計画終了後の行事';
  get('eventType').value='future';
  get('eventRepeat').value='once';
  get('eventAmount').value='-5';
  get('addEvent').onclick();
  assert.match(get('eventRows').innerHTML,/予定（計画期間外・試算対象外）/);
  get('endAge').value='41';get('endAge').oninput();
  assert.match(get('eventRows').innerHTML,/<td>将来<\/td>/);
  assert.doesNotMatch(get('eventRows').innerHTML,/計画期間外・試算対象外/);
});

test('changing birth month immediately refreshes event list plan boundary', () => {
  const {get}=app();
  get('endAge').value='40';get('endAge').oninput();
  get('eventDate').value='2030-02-01';
  get('eventTitle').value='誕生月の行事';
  get('eventType').value='future';
  get('eventRepeat').value='annual';
  get('eventAmount').value='-5';
  get('addEvent').onclick();
  assert.match(get('eventRows').innerHTML,/予定（計画期間外・試算対象外）/);
  get('birth').value='1990-02-01';get('birth').onchange();
  assert.match(get('eventRows').innerHTML,/<td>将来<\/td>/);
  assert.doesNotMatch(get('eventRows').innerHTML,/計画期間外・試算対象外/);
  assert.match(get('timelineYearLabel').textContent,/年/);
});


test('user-set pension starts in the 65th birthday month, not the preceding month', () => {
  const {get,calculate}=app();
  const now=new Date(),birthday=new Date(now.getFullYear(),now.getMonth()+1,1);
  const birthYear=birthday.getFullYear()-65;
  const birthMonth=String(birthday.getMonth()+1).padStart(2,'0');
  for(const [id,value] of [
    ['birth',birthYear+'-'+birthMonth+'-01'],['endAge','65'],
    ['cash','0'],['salary','0'],['expense','0'],['pension','10'],
    ['pensionAge','65'],['invest','0'],['contribution','0'],
    ['withdraw','0'],['returnRate','0'],['inflation','0'],
    ['wageGrowth','0'],['debt','0'],['debtRate','0'],['repayment','0']
  ]) get(id).value=value;
  assert.equal(calculate(),true);
  assert.match(get('stats').innerHTML,/最終純資産<strong>10万円/);
  get('pensionAge').value='66';
  assert.equal(calculate(),true);
  assert.match(get('stats').innerHTML,/最終純資産<strong>0万円/);
});

test('user-set retirement stops salary in the birthday month, not one month early', () => {
  const {get,calculate}=app();
  const now=new Date(),birthday=new Date(now.getFullYear(),now.getMonth()+1,1);
  const birthYear=birthday.getFullYear()-65;
  const birthMonth=String(birthday.getMonth()+1).padStart(2,'0');
  for(const [id,value] of [
    ['birth',birthYear+'-'+birthMonth+'-01'],['endAge','65'],
    ['cash','0'],['salary','7'],['expense','0'],['pension','0'],
    ['retireAge','65'],['invest','0'],['contribution','0'],
    ['withdraw','0'],['returnRate','0'],['inflation','0'],
    ['wageGrowth','0'],['debt','0'],['debtRate','0'],['repayment','0']
  ]) get(id).value=value;
  assert.equal(calculate(),true);
  assert.match(get('stats').innerHTML,/最終純資産<strong>7万円/);
  get('retireAge').value='66';
  assert.equal(calculate(),true);
  assert.match(get('stats').innerHTML,/最終純資産<strong>14万円/);
});


test('negative monthly contribution is rejected instead of silently treated as zero', () => {
  const {get,calculate}=app();
  assert.match(html, /id="contribution" type="number" min="0"/);
  get('contribution').value='-1';
  assert.equal(calculate(),false);
  assert.equal(get('stats').innerHTML,'');
  assert.equal(get('yearRows').innerHTML,'');
  assert.match(get('message').textContent,/投資積立と取崩しは0以上/);
  get('contribution').value='0';
  assert.equal(calculate(),true);
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('negative withdrawal is rejected and its backup cannot overwrite valid data', () => {
  const {get,calculate,restore,snapshot}=app();
  assert.match(html, /id="withdraw" type="number" min="0"/);
  get('withdraw').value='-2';
  assert.equal(calculate(),false);
  assert.equal(get('chart').innerHTML,'');
  assert.match(get('message').textContent,/投資積立と取崩しは0以上/);
  get('withdraw').value='0';
  assert.equal(calculate(),true);
  const before=snapshot(),invalid=structuredClone(before);
  invalid.fields.withdraw='-2';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('negative loan principal is rejected rather than silently clamped to zero', () => {
  const {get,calculate,restore,snapshot}=app();
  assert.match(html, /id="debt" type="number" min="0"/);
  get('debt').value='-1';
  assert.equal(calculate(),false);
  assert.equal(get('stats').innerHTML,'');
  assert.equal(get('yearRows').innerHTML,'');
  assert.match(get('message').textContent,/借入残高と毎月の返済額は0以上/);
  get('debt').value='0';
  assert.equal(calculate(),true);
  const before=snapshot(),invalid=structuredClone(before);
  invalid.fields.debt='-1';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
});

test('negative loan repayment is rejected, while zero repayment remains valid', () => {
  const {get,calculate,restore,snapshot}=app();
  assert.match(html, /id="repayment" type="number" min="0"/);
  get('debt').value='100';
  get('repayment').value='-0.5';
  assert.equal(calculate(),false);
  assert.equal(get('chart').innerHTML,'');
  assert.match(get('message').textContent,/借入残高と毎月の返済額は0以上/);
  get('repayment').value='0';
  assert.equal(calculate(),true);
  const before=snapshot(),invalid=structuredClone(before);
  invalid.fields.repayment='-0.5';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('negative investment balance is rejected without leaving stale projection', () => {
  const {get,calculate}=app();
  assert.match(html, /id="invest" type="number" min="0"/);
  get('invest').value='-0.5';
  assert.equal(calculate(),false);
  assert.equal(get('stats').innerHTML,'');
  assert.equal(get('yearRows').innerHTML,'');
  assert.equal(get('chart').innerHTML,'');
  assert.match(get('message').textContent,/運用資産残高は0以上/);
  get('invest').value='0';
  assert.equal(calculate(),true);
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('negative investment balance in backup cannot overwrite valid settings', () => {
  const {get,calculate,restore,snapshot}=app();
  get('invest').value='0';
  assert.equal(calculate(),true);
  const before=snapshot(),invalid=structuredClone(before);
  invalid.fields.invest='-1';
  invalid.fields.salary='99';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.match(get('stats').innerHTML,/最終純資産/);
});


test('negative living expense cannot silently increase projected cash', () => {
  const {get,calculate}=app();
  assert.match(html, /id="expense" type="number" min="0"/);
  get('expense').value='-1';
  assert.equal(calculate(),false);
  assert.equal(get('stats').innerHTML,'');
  assert.equal(get('yearRows').innerHTML,'');
  assert.equal(get('chart').innerHTML,'');
  assert.match(get('message').textContent,/月の生活費は0以上/);
  get('expense').value='0';
  assert.equal(calculate(),true);
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('negative living expense backup is rejected and prior data restored', () => {
  const {get,calculate,restore,snapshot}=app();
  assert.equal(calculate(),true);
  const before=snapshot(),invalid=structuredClone(before);
  invalid.fields.expense='-0.1';
  invalid.fields.salary='99';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.match(get('stats').innerHTML,/最終純資産/);
});


test('negative monthly take-home salary is rejected instead of subtracting from cash', () => {
  const {get,calculate,restore,snapshot}=app();
  assert.match(html, /id="salary" type="number" min="0"/);
  get('salary').value='-1';
  assert.equal(calculate(),false);
  assert.equal(get('stats').innerHTML,'');
  assert.equal(get('yearRows').innerHTML,'');
  assert.match(get('message').textContent,/手取り給与と年金手取り想定は0以上/);
  get('salary').value='0';
  assert.equal(calculate(),true);
  const before=snapshot(),invalid=structuredClone(before);
  invalid.fields.salary='-1';
  invalid.fields.expense='99';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
});

test('negative monthly take-home pension is rejected, zero remains valid and backup rolls back', () => {
  const {get,calculate,restore,snapshot}=app();
  assert.match(html, /id="pension" type="number" min="0"/);
  get('pension').value='-0.1';
  assert.equal(calculate(),false);
  assert.equal(get('chart').innerHTML,'');
  assert.match(get('message').textContent,/手取り給与と年金手取り想定は0以上/);
  get('pension').value='0';
  assert.equal(calculate(),true);
  const before=snapshot(),invalid=structuredClone(before);
  invalid.fields.pension='-0.1';
  invalid.fields.cash='999';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.match(get('stats').innerHTML,/最終純資産/);
});


test('retirement age must be an integer within 0 to 125, including backup restore', () => {
  const {get,calculate,restore,snapshot}=app();
  assert.match(html,/id="retireAge" type="number" value="65" min="0" max="125" step="1"/);
  get('retireAge').value='64.5';
  assert.equal(calculate(),false);
  assert.equal(get('stats').innerHTML,'');
  assert.equal(get('yearRows').innerHTML,'');
  assert.match(get('message').textContent,/退職・年金開始年齢は0〜125歳の整数/);
  get('retireAge').value='0';
  get('pensionAge').value='125';
  assert.equal(calculate(),true);
  const before=snapshot(),invalid=structuredClone(before);
  invalid.fields.retireAge='126';
  invalid.fields.salary='99';
  assert.throws(()=>restore(invalid),/退職・年金開始年齢/);
  assert.deepEqual(snapshot(),before);
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('pension start age rejects fractions and negatives without overwriting valid backup', () => {
  const {get,calculate,restore,snapshot}=app();
  assert.match(html,/id="pensionAge" type="number" value="65" min="0" max="125" step="1"/);
  get('pensionAge').value='65.5';
  assert.equal(calculate(),false);
  assert.equal(get('chart').innerHTML,'');
  assert.match(get('message').textContent,/退職・年金開始年齢は0〜125歳の整数/);
  get('pensionAge').value='-1';
  assert.equal(calculate(),false);
  get('pensionAge').value='0';
  assert.equal(calculate(),true);
  const before=snapshot(),invalid=structuredClone(before);
  invalid.fields.pensionAge='125.1';
  invalid.fields.cash='999';
  assert.throws(()=>restore(invalid),/退職・年金開始年齢/);
  assert.deepEqual(snapshot(),before);
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('editing monthly salary immediately hides stale projections until recalculation', () => {
  const {get,calculate}=app();
  assert.match(get('stats').innerHTML,/最終純資産/);
  get('salary').value='25';
  get('salary').oninput();
  assert.equal(get('stats').innerHTML,'');
  assert.equal(get('yearRows').innerHTML,'');
  assert.equal(get('chart').innerHTML,'');
  assert.match(get('message').textContent,/試算条件が変更されました/);
  assert.equal(calculate(),true);
  assert.match(get('stats').innerHTML,/最終純資産/);
  get('inflation').value='3';
  get('inflation').oninput();
  assert.equal(get('chart').innerHTML,'');
});

test('changing birthdate or plan end age refreshes timeline and hides old asset totals', () => {
  const {get,calculate}=app();
  get('endAge').value='96';
  get('endAge').oninput();
  assert.equal(get('timelineYear').max,'2086');
  assert.equal(get('stats').innerHTML,'');
  assert.equal(calculate(),true);
  get('birth').value='1991-01-01';
  get('birth').onchange();
  assert.equal(get('timelineYear').max,'2087');
  assert.equal(get('stats').innerHTML,'');
  assert.match(get('message').textContent,/再計算する/);
  assert.equal(calculate(),true);
  get('name').value='別名';
  get('name').oninput();
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('annual leap-day event is labelled as February end in a non-leap year', () => {
  const {get,snapshot}=app();
  get('eventDate').value='2024-02-29';
  get('eventTitle').value='閏日の記念日';
  get('eventAmount').value='0';
  get('eventRepeat').value='annual';
  get('addEvent').onclick();
  const before=snapshot();
  get('timelineYear').value='2027';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/2027年02月末（2月29日がない年）：閏日の記念日（毎年）/);
  assert.doesNotMatch(get('timelineEvents').innerHTML,/2027年02月29日/);
  get('timelineYear').value='2028';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/2028年02月29日：閏日の記念日（毎年）/);
  assert.deepEqual(snapshot(),before);
});

test('non-recurring leap-day memory keeps its original date and ordinary annual dates remain unchanged', () => {
  const {get}=app();
  get('eventDate').value='2024-02-29';get('eventTitle').value='一度きりの記録';
  get('eventAmount').value='0';get('eventType').value='past';get('eventRepeat').value='once';
  get('addEvent').onclick();
  get('eventDate').value='2024-02-28';get('eventTitle').value='毎年の行事';
  get('eventType').value='future';get('eventRepeat').value='annual';
  get('addEvent').onclick();
  get('timelineYear').value='2024';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/2024年02月29日：一度きりの記録/);
  get('timelineYear').value='2027';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/2027年02月28日：毎年の行事（毎年）/);
  assert.doesNotMatch(get('timelineEvents').innerHTML,/2027年02月末/);
});


test('future-dated past chronicle is rejected without changing existing memories', () => {
  const {get,alerts,snapshot}=app();
  const before=snapshot();
  get('eventDate').value='2999-01-01';
  get('eventTitle').value='まだ起きていない思い出';
  get('eventAmount').value='0';
  get('eventType').value='past';
  get('addEvent').onclick();
  assert.deepEqual(snapshot(),before);
  assert.match(alerts.at(-1),/過去のクロニクルには今日以前/);
});

test('today is allowed for past chronicle, while future events stay permitted and invalid backups roll back', () => {
  const {get,restore,snapshot}=app();
  const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  get('eventDate').value=today;
  get('eventTitle').value='今日の記録';
  get('eventAmount').value='0';
  get('eventType').value='past';
  get('addEvent').onclick();
  assert.equal(snapshot().events.at(-1).date,today);
  get('eventDate').value='2999-01-01';
  get('eventTitle').value='未来の予定';
  get('eventType').value='future';
  get('addEvent').onclick();
  assert.equal(snapshot().events.at(-1).type,'future');
  const before=snapshot(),invalid=structuredClone(before);
  invalid.events.push({date:'2999-01-01',title:'未来を過去として登録',type:'past',amount:0,repeat:'once'});
  assert.throws(()=>restore(invalid),/イベントデータが不正/);
  assert.deepEqual(snapshot(),before);
});

test('annual linked event creates recurring trail markers, without changing saved event', () => {
 const {get,snapshot}=app();
 get('eventDate').value='2024-02-29';get('eventTitle').value='毎年の記念日';
 get('eventType').value='future';get('eventRepeat').value='annual';get('eventAmount').value='0';
 get('eventPerson').value='self';get('addEvent').onclick();
 const before=snapshot();
 get('timelineYear').value='2023';get('timelineYear').oninput();
 assert.equal((get('timelineTrails').innerHTML.match(/class="life-event-marker"/g)||[]).length,0);
 get('timelineYear').value='2027';get('timelineYear').oninput();
 assert.equal((get('timelineTrails').innerHTML.match(/class="life-event-marker"/g)||[]).length,4);
 get('timelineYear').value='2028';get('timelineYear').oninput();
 assert.equal((get('timelineTrails').innerHTML.match(/class="life-event-marker"/g)||[]).length,5);
 assert.deepEqual(snapshot(),before);
});

test('annual two-person encounter repeats crossing paths, one-time event stays single', () => {
 const {get,snapshot}=app();
 for(const name of ['親友','ロッキー']){
  get('familyName').value=name;get('familyRole').value='友人';get('familyBirth').value='2000-01-01';get('addFamily').onclick();
 }
 get('eventDate').value='2024-03-01';get('eventTitle').value='毎年の再会';
 get('eventType').value='future';get('eventRepeat').value='annual';get('eventAmount').value='0';
 get('eventPerson').value='legacy:0';get('eventPerson2').value='legacy:1';get('addEvent').onclick();
 get('timelineYear').value='2027';get('timelineYear').oninput();
 assert.equal((get('timelineTrails').innerHTML.match(/class="life-connection"/g)||[]).length,4);
 get('eventDate').value='2025-01-01';get('eventTitle').value='一度だけ';
 get('eventRepeat').value='once';get('eventPerson').value='f1';get('eventPerson2').value='f2';get('addEvent').onclick();
 get('timelineYear').value='2027';get('timelineYear').oninput();
 assert.equal((get('timelineTrails').innerHTML.match(/class="life-connection"/g)||[]).length,5);
 assert.equal(snapshot().events.length,2);
});

test('failed backup restore preserves deliberately stale projection state', () => {
 const {get,restore,snapshot}=app();
 get('salary').value='25';
 get('salary').oninput();
 const before=snapshot(),message=get('message').textContent;
 assert.equal(get('stats').innerHTML,'');
 assert.equal(get('yearRows').innerHTML,'');
 assert.equal(get('chart').innerHTML,'');
 const invalid=structuredClone(before);
 invalid.fields.wageGrowth='-200';
 assert.throws(()=>restore(invalid),/試算条件/);
 assert.deepEqual(snapshot(),before);
 assert.equal(get('stats').innerHTML,'');
 assert.equal(get('yearRows').innerHTML,'');
 assert.equal(get('chart').innerHTML,'');
 assert.equal(get('message').textContent,message);
});

test('failed backup restore does not replace pending input warning with recalculation error', () => {
 const {get,restore,snapshot}=app();
 get('expense').value='-5';
 get('expense').oninput();
 const before=snapshot(),message=get('message').textContent;
 assert.match(message,/試算条件が変更されました/);
 const invalid=structuredClone(before);
 invalid.fields.wageGrowth='-200';
 assert.throws(()=>restore(invalid),/試算条件/);
 assert.deepEqual(snapshot(),before);
 assert.equal(get('stats').innerHTML,'');
 assert.equal(get('yearRows').innerHTML,'');
 assert.equal(get('chart').innerHTML,'');
 assert.equal(get('message').textContent,message);
});

test('failed restore preserves both selected people while editing an event', () => {
  const {get,restore,snapshot}=app();
  for (const name of ['親友','ロッキー']) {
    get('familyName').value=name;
    get('familyRole').value='家族';
    get('familyBirth').value='2000-01-01';
    get('addFamily').onclick();
  }
  get('eventPerson').value='legacy:0';
  get('eventPerson2').value='legacy:1';
  const before=snapshot(),invalid=structuredClone(before);
  invalid.families=[];
  invalid.fields.wageGrowth='-200';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.equal(get('eventPerson').value,'legacy:0');
  assert.equal(get('eventPerson2').value,'legacy:1');
});

test('failed restore preserves existing linked person IDs and pending event form', () => {
  const {get,restore,snapshot}=app();
  for (const name of ['友人','ペット']) {
    get('familyName').value=name;
    get('familyRole').value='家族';
    get('familyBirth').value='2000-01-01';
    get('addFamily').onclick();
  }
  get('eventDate').value='2026-12-01';
  get('eventTitle').value='交差する出来事';
  get('eventAmount').value='0';
  get('eventPerson').value='legacy:0';
  get('eventPerson2').value='legacy:1';
  get('addEvent').onclick();
  get('eventTitle').value='編集中の新しい出来事';
  get('eventPerson').value='f1';
  get('eventPerson2').value='f2';
  const before=snapshot(),invalid=structuredClone(before);
  invalid.families=[];
  invalid.events=[];
  invalid.fields.wageGrowth='-200';
  assert.throws(()=>restore(invalid),/試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.equal(get('eventPerson').value,'f1');
  assert.equal(get('eventPerson2').value,'f2');
  assert.equal(get('eventTitle').value,'編集中の新しい出来事');
});

test('successful restore clears pending event draft and links when identical IDs now refer to different people', () => {
  const {get,restore,snapshot}=app();
  const old=snapshot();
  old.families=[
    {id:'f1',name:'旧友',role:'友人',birth:'2000-01-01'},
    {id:'f2',name:'旧ペット',role:'ペット',birth:'2010-01-01'}
  ];
  restore(old);
  get('eventPerson').value='f1';
  get('eventPerson2').value='f2';
  get('eventTitle').value='入力途中の思い出';
  const next=structuredClone(old);
  next.families[0].name='別の友人';
  next.families[1].name='別のペット';
  restore(next);
  assert.deepEqual(snapshot().families,next.families);
  assert.equal(get('eventPerson').value,'');
  assert.equal(get('eventPerson2').value,'');
  assert.equal(get('eventTitle').value,'');
});

test('successful restore clears legacy index links that could silently point at different family', () => {
  const {get,restore,snapshot}=app();
  for (const name of ['元の友人','元の犬']) {
    get('familyName').value=name;
    get('familyRole').value='家族';
    get('familyBirth').value='2000-01-01';
    get('addFamily').onclick();
  }
  get('eventPerson').value='legacy:0';
  get('eventPerson2').value='legacy:1';
  const next=snapshot();
  next.families=[
    {name:'新しい友人',role:'友人',birth:'2001-01-01'},
    {name:'新しい犬',role:'ペット',birth:'2011-01-01'}
  ];
  restore(next);
  assert.deepEqual(snapshot().families,next.families);
  assert.equal(get('eventPerson').value,'');
  assert.equal(get('eventPerson2').value,'');
});


test('invalid JSON import gives a safe format hint without exposing parser input', async () => {
 const {importFile,get,snapshot}=app();
 const before=snapshot();
 await importFile({size:80,text:async()=>'{"secretPersonName":"内緒",'});
 assert.deepEqual(snapshot(),before);
 assert.match(get('message').textContent,/読み込みに失敗しました.*JSON形式/);
 assert.doesNotMatch(get('message').textContent,/内緒|secretPersonName/);
});

test('invalid event backup explains the known validation failure and retains current data', async () => {
 const {importFile,get,snapshot,storage}=app();
 const before=snapshot(),bad=structuredClone(before);
 bad.events=[{date:'2030-01-01',title:'予定',type:'unknown',amount:0,repeat:'once'}];
 await importFile({size:500,text:async()=>JSON.stringify(bad)});
 assert.deepEqual(snapshot(),before);
 assert.match(get('message').textContent,/読み込みに失敗しました.*イベントデータが不正/);
 storage.getItem=()=>JSON.stringify(bad);
 get('load').onclick();
 assert.deepEqual(snapshot(),before);
 assert.match(get('message').textContent,/保存データを読み込めませんでした.*イベントデータが不正/);
 assert.match(get('message').textContent,/削除していません/);
});

test('deleting an earlier family preserves both pending legacy selections by identity', () => {
  const {get,snapshot}=app();
  for(const name of ['削除する人','親友','ロッキー']){
    get('familyName').value=name;
    get('familyRole').value='家族';
    get('familyBirth').value='2000-01-01';
    get('addFamily').onclick();
  }
  get('eventPerson').value='legacy:2';
  get('eventPerson2').value='legacy:1';
  get('familyList').onclick({target:{dataset:{family:'0'}}});
  assert.deepEqual(snapshot().families.map(f=>f.name),['親友','ロッキー']);
  assert.equal(get('eventPerson').value,'legacy:1');
  assert.equal(get('eventPerson2').value,'legacy:0');
  get('eventDate').value='2026-12-01';
  get('eventTitle').value='二人の記念日';
  get('eventAmount').value='0';
  get('addEvent').onclick();
  const after=snapshot();
  assert.equal(after.events[0].personId,after.families[1].id);
  assert.equal(after.events[0].secondPersonId,after.families[0].id);
});

test('deleting selected legacy family promotes the surviving second person', () => {
  const {get,snapshot}=app();
  for(const name of ['削除する人','友人','ペット']){
    get('familyName').value=name;
    get('familyRole').value='家族';
    get('familyBirth').value='2000-01-01';
    get('addFamily').onclick();
  }
  get('eventPerson').value='legacy:0';
  get('eventPerson2').value='legacy:2';
  const before=snapshot().events;
  get('familyList').onclick({target:{dataset:{family:'0'}}});
  assert.equal(get('eventPerson').value,'legacy:1');
  assert.equal(get('eventPerson2').value,'');
  assert.deepEqual(snapshot().events,before);
  get('eventDate').value='2026-12-01';
  get('eventTitle').value='残った人の思い出';
  get('eventAmount').value='0';
  get('addEvent').onclick();
  assert.equal(snapshot().events[0].personId,snapshot().families[1].id);
});

test('deleting a linked primary person promotes the surviving persistent ID', () => {
  const {get,snapshot,alerts}=app();
  for(const name of ['削除する人','残る親友']){
    get('familyName').value=name;
    get('familyRole').value='友人';
    get('familyBirth').value='2000-01-01';
    get('addFamily').onclick();
  }
  get('eventDate').value='2026-12-01';
  get('eventTitle').value='二人の出来事';
  get('eventAmount').value='0';
  get('eventPerson').value='legacy:0';
  get('eventPerson2').value='legacy:1';
  get('addEvent').onclick();
  const original=snapshot();
  assert.equal(original.events[0].personId,'f1');
  assert.equal(original.events[0].secondPersonId,'f2');
  get('eventPerson').value='f1';
  get('eventPerson2').value='f2';
  get('familyList').onclick({target:{dataset:{family:'0'}}});
  assert.equal(get('eventPerson').value,'f2');
  assert.equal(get('eventPerson2').value,'');
  assert.equal(snapshot().events[0].personId,'f2');
  assert.equal(snapshot().events[0].secondPersonId,undefined);
  // 新規登録フォームは成功時に初期化されるため日付を改めて入力する。
  get('eventDate').value='2026-12-02';
  get('eventTitle').value='残る人の新しい予定';
  get('eventAmount').value='0';
  get('addEvent').onclick();
  assert.equal(snapshot().events.at(-1).personId,'f2');
  assert.equal(alerts.length,0);
});

test('light trails prioritize newest dated events when more than twenty are linked', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'友人',role:'友人',birth:'1990-01-01'}];
  backup.events=Array.from({length:25},(_,i)=>({
    date:`${2027+i}-06-01`,title:`再会${2027+i}`,type:'future',
    amount:0,repeat:'once',personId:'self',secondPersonId:'f1'
  }));
  restore(backup);
  get('timelineYear').value='2051';
  get('timelineYear').oninput();
  const svg=get('timelineTrails').innerHTML;
  assert.match(svg,/<title>再会2051<\/title>/);
  assert.doesNotMatch(svg,/<title>再会2027<\/title>/);
  assert.equal((svg.match(/class="life-event-marker"/g)||[]).length,40);
  assert.equal((svg.match(/class="life-connection"/g)||[]).length,20);
});

test('light trails prioritize recent annual occurrences even when their first date is old', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'親友',role:'友人',birth:'1990-01-01'}];
  backup.events=[
    {date:'2001-03-01',title:'毎年の再会',type:'future',amount:0,
      repeat:'annual',personId:'self',secondPersonId:'f1'},
    ...Array.from({length:25},(_,i)=>({
      date:`${2027+i}-06-01`,title:`一度きり${2027+i}`,type:'future',
      amount:0,repeat:'once',personId:'self',secondPersonId:'f1'
    }))
  ];
  restore(backup);
  const before=snapshot();
  get('timelineYear').value='2051';
  get('timelineYear').oninput();
  const svg=get('timelineTrails').innerHTML;
  assert.match(svg,/<title>毎年の再会<\/title>/);
  assert.match(svg,/<title>一度きり2051<\/title>/);
  assert.doesNotMatch(svg,/<title>一度きり2027<\/title>/);
  assert.equal((svg.match(/class="life-event-marker"/g)||[]).length,40);
  assert.equal((svg.match(/class="life-connection"/g)||[]).length,20);
  assert.deepEqual(snapshot(),before);
});

test('annual past chronicles never invent future memories in timeline or light trails', () => {
  const {restore,snapshot,get}=app();
  const currentYear=new Date().getFullYear();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'親友',role:'友人',birth:'1990-01-01'}];
  backup.events=[{date:'2000-01-01',title:'毎年の思い出',type:'past',
    amount:0,repeat:'annual',personId:'self',secondPersonId:'f1'}];
  restore(backup);
  const before=snapshot();
  get('timelineYear').value=String(currentYear-1);get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/毎年の思い出（毎年） — 記録（試算対象外）/);
  get('timelineYear').value=String(currentYear+2);get('timelineYear').oninput();
  assert.doesNotMatch(get('timelineEvents').innerHTML,/毎年の思い出/);
  const svg=get('timelineTrails').innerHTML;
  assert.equal((svg.match(/class="life-event-marker"/g)||[]).length,36);
  assert.equal((svg.match(/class="life-connection"/g)||[]).length,18);
  assert.deepEqual(snapshot(),before);
});

test('annual past chronicle occurrence later this year is not yet a memory', () => {
  const {restore,snapshot,get}=app();
  const today=new Date(),tomorrow=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1);
  if(tomorrow.getFullYear()!==today.getFullYear())return;
  const monthDay=String(tomorrow.getMonth()+1).padStart(2,'0')+'-'+String(tomorrow.getDate()).padStart(2,'0');
  const backup=snapshot();
  backup.events=[{date:'2000-'+monthDay,title:'明日の記念日',type:'past',amount:0,repeat:'annual'}];
  restore(backup);
  get('timelineYear').value=String(today.getFullYear());get('timelineYear').oninput();
  assert.doesNotMatch(get('timelineEvents').innerHTML,/明日の記念日/);
  get('timelineYear').value=String(today.getFullYear()-1);get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/明日の記念日/);
});

test('light trails retain a distinct older memory beside twenty annual occurrences', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'友人',role:'友人',birth:'1990-01-01'}];
  backup.events=[
    {date:'2001-03-01',title:'毎年の再会',type:'future',amount:0,
      repeat:'annual',personId:'self',secondPersonId:'f1'},
    {date:'2027-06-01',title:'一度だけの思い出',type:'future',amount:0,
      repeat:'once',personId:'self',secondPersonId:'f1'}
  ];
  restore(backup);
  const before=snapshot();
  get('timelineYear').value='2051';get('timelineYear').oninput();
  const svg=get('timelineTrails').innerHTML;
  assert.match(svg,/<title>一度だけの思い出<\/title>/);
  assert.match(svg,/<title>毎年の再会<\/title>/);
  assert.equal((svg.match(/class="life-event-marker"/g)||[]).length,40);
  assert.equal((svg.match(/class="life-connection"/g)||[]).length,20);
  assert.deepEqual(snapshot(),before);
});


test('light trails exclude one-time events before a participant is born in the same year', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'年末生まれの友人',role:'友人',birth:'1990-12-20'}];
  backup.events=[
    {date:'1990-06-01',title:'友人の誕生前',type:'future',amount:0,repeat:'once',personId:'self',secondPersonId:'f1'},
    {date:'1990-12-25',title:'友人の誕生後',type:'future',amount:0,repeat:'once',personId:'self',secondPersonId:'f1'}
  ];
  restore(backup);
  const before=snapshot();
  get('timelineYear').value='1990';get('timelineYear').oninput();
  const svg=get('timelineTrails').innerHTML;
  assert.equal((svg.match(/class="life-event-marker"/g)||[]).length,3);
  assert.equal((svg.match(/class="life-connection"/g)||[]).length,1);
  assert.match(svg,/<path class="life-connection"[^>]*><title>友人の誕生後<\/title><\/path>/);
  assert.deepEqual(snapshot(),before);
});

test('annual light trail occurrence begins after the linked person birthday, not birth year start', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'年末生まれの友人',role:'友人',birth:'1990-12-20'}];
  backup.events=[{date:'1988-06-01',title:'毎年6月の出来事',type:'future',amount:0,repeat:'annual',personId:'f1'}];
  restore(backup);
  const before=snapshot();
  get('timelineYear').value='1990';get('timelineYear').oninput();
  assert.equal((get('timelineTrails').innerHTML.match(/class="life-event-marker"/g)||[]).length,0);
  get('timelineYear').value='1991';get('timelineYear').oninput();
  assert.equal((get('timelineTrails').innerHTML.match(/class="life-event-marker"/g)||[]).length,1);
  assert.deepEqual(snapshot(),before);
});

test('timeline flags linked events before a person\'s birthday without hiding the memory', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'年末生まれの友人',role:'友人',birth:'1990-12-20'}];
  backup.events=[
    {date:'1990-06-01',title:'誕生前の予定',type:'future',amount:0,repeat:'once',personId:'self',secondPersonId:'f1'},
    {date:'1990-12-25',title:'誕生後の予定',type:'future',amount:0,repeat:'once',personId:'self',secondPersonId:'f1'}
  ];
  restore(backup);
  const before=snapshot();
  get('timelineYear').value='1990';get('timelineYear').oninput();
  const list=get('timelineEvents').innerHTML;
  assert.match(list,/誕生前の予定[^<]*関連人物の誕生前：日付を確認/);
  assert.match(list,/誕生後の予定/);
  assert.equal((list.match(/関連人物の誕生前：日付を確認/g)||[]).length,1);
  assert.deepEqual(snapshot(),before);
});

test('annual leap-day memory warns only before linked person birth', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'春生まれの友人',role:'友人',birth:'2000-03-01'}];
  backup.events=[{date:'1992-02-29',title:'2月末の記念日',type:'past',amount:0,
    repeat:'annual',personId:'f1'}];
  restore(backup);
  const before=snapshot();
  get('timelineYear').value='2000';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/関連人物の誕生前：日付を確認/);
  get('timelineYear').value='2001';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/2月末の記念日/);
  assert.doesNotMatch(get('timelineEvents').innerHTML,/関連人物の誕生前：日付を確認/);
  assert.deepEqual(snapshot(),before);
});


test('event table warns for linked pre-birth event without warning after birthday', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'年末生まれの友人',role:'友人',birth:'1990-12-20'}];
  backup.events=[
    {date:'1990-06-01',title:'誕生前の予定',type:'future',amount:0,repeat:'once',personId:'self',secondPersonId:'f1'},
    {date:'1990-12-25',title:'誕生後の予定',type:'future',amount:0,repeat:'once',personId:'self',secondPersonId:'f1'}
  ];
  restore(backup);
  const before=snapshot(),rows=get('eventRows').innerHTML;
  assert.match(rows,/誕生前の予定[^<]*<div class="muted">登録開始日が関連人物の誕生前：日付を確認<\/div>/);
  assert.match(rows,/誕生後の予定/);
  assert.equal((rows.match(/登録開始日が関連人物の誕生前：日付を確認/g)||[]).length,1);
  assert.deepEqual(snapshot(),before);
});

test('event table uses original annual leap-day date to flag only pre-birth links', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'春生まれの友人',role:'友人',birth:'2000-03-01'}];
  backup.events=[
    {date:'1992-02-29',title:'登録開始が誕生前',type:'past',amount:0,repeat:'annual',personId:'f1'},
    {date:'2004-02-29',title:'登録開始が誕生後',type:'past',amount:0,repeat:'annual',personId:'f1'}
  ];
  restore(backup);
  const before=snapshot(),rows=get('eventRows').innerHTML;
  assert.match(rows,/登録開始が誕生前（毎年）[^<]*<div class="muted">登録開始日が関連人物の誕生前：日付を確認<\/div>/);
  assert.match(rows,/登録開始が誕生後（毎年）/);
  assert.equal((rows.match(/登録開始日が関連人物の誕生前：日付を確認/g)||[]).length,1);
  assert.deepEqual(snapshot(),before);
});

test('event table displays linked friend and pet names safely without changing saved data', () => {
 const {restore,snapshot,get}=app();
 const backup=snapshot();
 backup.families=[
  {id:'f1',name:'親友 <甲>',role:'友人',birth:'1990-01-01'},
  {id:'f2',name:'ロッキー & Co',role:'ペット',birth:'2015-01-01'}
 ];
 backup.events=[
  {date:'2020-04-01',title:'散歩',type:'past',amount:0,repeat:'once',personId:'f1',secondPersonId:'f2'},
  {date:'2021-01-01',title:'単独の予定',type:'future',amount:0,repeat:'once'}
 ];
 restore(backup);
 const before=snapshot(),rows=get('eventRows').innerHTML;
 assert.match(rows,/散歩[^<]*<div class="muted">関連：親友 &lt;甲&gt;・ロッキー &amp; Co<\/div>/);
 assert.equal((rows.match(/<div class="muted">関連：/g)||[]).length,1);
 assert.doesNotMatch(rows,/<甲>/);
 assert.deepEqual(snapshot(),before);
});

test('renaming self immediately updates linked event table without recalculating assets', () => {
 const {get,snapshot}=app();
 get('eventDate').value='2030-05-01';
 get('eventTitle').value='本人の記念日';
 get('eventAmount').value='0';
 get('eventPerson').value='self';
 get('addEvent').onclick();
 const before=snapshot();
 get('name').value='新しい呼び名';
 get('name').oninput();
 const rows=get('eventRows').innerHTML;
 assert.match(rows,/本人の記念日[^<]*<div class="muted">関連：新しい呼び名<\/div>/);
 assert.doesNotMatch(rows,/関連：本人<\/div>/);
 assert.deepEqual(snapshot().events,before.events);
 assert.equal(snapshot().fields.name,'新しい呼び名');
 assert.match(get('stats').innerHTML,/最終純資産/);
});

test('family timeline distinguishes identical names by escaped relationship without changing data', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[
    {id:'f1',name:'ロッキー',role:'親友 <A>',birth:'2018-05-03'},
    {id:'f2',name:'ロッキー',role:'ペット & 犬',birth:'2019-07-03'}
  ];
  restore(backup);
  const before=snapshot();
  get('timelineYear').value='2030';
  get('timelineYear').oninput();
  const ages=get('timelineAges').innerHTML;
  assert.match(ages,/ロッキー：12歳（親友 &lt;A&gt;）/);
  assert.match(ages,/ロッキー：11歳（ペット &amp; 犬）/);
  assert.match(ages,/本人：40歳<\/li>/);
  assert.doesNotMatch(ages,/<A>/);
  assert.deepEqual(snapshot(),before);
});

test('event links distinguish same-name friend and pet by escaped relationship in list and timeline', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[
    {id:'f1',name:'ロッキー',role:'親友 <A>',birth:'2018-05-03'},
    {id:'f2',name:'ロッキー',role:'ペット & 犬',birth:'2019-07-03'}
  ];
  backup.events=[{date:'2022-05-01',title:'二人の思い出',type:'past',amount:0,
    repeat:'once',personId:'f1',secondPersonId:'f2'}];
  restore(backup);
  const before=snapshot();
  const rows=get('eventRows').innerHTML;
  assert.match(rows,/関連：ロッキー（親友 &lt;A&gt;）・ロッキー（ペット &amp; 犬）/);
  get('timelineYear').value='2022';get('timelineYear').oninput();
  assert.match(get('timelineEvents').innerHTML,/関連：ロッキー（親友 &lt;A&gt;）・ロッキー（ペット &amp; 犬）/);
  assert.doesNotMatch(rows,/<A>/);
  assert.deepEqual(snapshot(),before);
});

test('event links distinguish self from a pet with the same name without modifying records', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.fields.name='ロッキー';
  backup.families=[{id:'f1',name:'ロッキー',role:'ペット',birth:'2015-01-01'}];
  backup.events=[{date:'2022-05-01',title:'散歩',type:'past',amount:0,
    repeat:'once',personId:'self',secondPersonId:'f1'}];
  restore(backup);
  const before=snapshot();
  assert.match(get('eventRows').innerHTML,/関連：ロッキー（本人）・ロッキー（ペット）/);
  assert.deepEqual(snapshot(),before);
});

test('same-name same-role people with different birthdays are distinct in selectors and memories', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[
    {id:'f1',name:'ロッキー',role:'友人',birth:'2000-01-01'},
    {id:'f2',name:'ロッキー',role:'友人',birth:'2001-02-02'}
  ];
  backup.events=[{date:'2022-05-01',title:'再会',type:'past',amount:0,
    repeat:'once',personId:'f1',secondPersonId:'f2'}];
  restore(backup);
  const before=snapshot();
  const choices=get('eventPerson').innerHTML;
  assert.ok(choices.includes('<option value="f1">ロッキー（友人・2000-01-01）</option>'));
  assert.ok(choices.includes('<option value="f2">ロッキー（友人・2001-02-02）</option>'));
  const expected='関連：ロッキー（友人・2000-01-01）・ロッキー（友人・2001-02-02）';
  assert.ok(get('eventRows').innerHTML.includes(expected));
  get('timelineYear').value='2022';get('timelineYear').oninput();
  assert.ok(get('timelineEvents').innerHTML.includes(expected));
  assert.deepEqual(snapshot(),before);
});

test('exact duplicate names roles and birthdays get unique selection labels and keep IDs', () => {
  const {restore,snapshot,get}=app();
  const backup=snapshot();
  backup.families=[
    {id:'f1',name:'同名',role:'友人',birth:'2000-01-01'},
    {id:'f2',name:'同名',role:'友人',birth:'2000-01-01'}
  ];
  backup.events=[{date:'2022-05-01',title:'記念日',type:'past',amount:0,
    repeat:'once',personId:'f1',secondPersonId:'f2'}];
  restore(backup);
  const before=snapshot();
  const choices=get('eventPerson').innerHTML;
  assert.ok(choices.includes('<option value="f1">同名（友人・2000-01-01・登録1）</option>'));
  assert.ok(choices.includes('<option value="f2">同名（友人・2000-01-01・登録2）</option>'));
  const expected='関連：同名（友人・2000-01-01・登録1）・同名（友人・2000-01-01・登録2）';
  assert.ok(get('eventRows').innerHTML.includes(expected));
  get('timelineYear').value='2022';get('timelineYear').oninput();
  assert.ok(get('timelineEvents').innerHTML.includes(expected));
  assert.deepEqual(snapshot(),before);
  get('eventPerson').value='f2';get('eventPerson2').value='f1';
  get('eventDate').value='2030-05-01';get('eventTitle').value='選択確認';get('eventAmount').value='0';
  get('addEvent').onclick();
  assert.equal(snapshot().events.at(-1).personId,'f2');
  assert.equal(snapshot().events.at(-1).secondPersonId,'f1');
});

test('deletion dialog and accessible label distinguish identical event titles by linked person', () => {
 const {get,restore,snapshot,setCanClear,confirmMessages}=app();
 const backup=snapshot();
 backup.families=[
  {id:'f1',name:'ロッキー',role:'友人',birth:'2000-01-01'},
  {id:'f2',name:'ロッキー',role:'ペット',birth:'2018-05-03'}
 ];
 backup.events=[
  {date:'2022-05-03',title:'出会い',type:'past',amount:0,repeat:'once',personId:'f1',note:'友人との思い出'},
  {date:'2022-05-03',title:'出会い',type:'past',amount:0,repeat:'once',personId:'f2',note:'ペットとの思い出'}
 ];
 restore(backup);
 const before=snapshot(),rows=get('eventRows').innerHTML;
 assert.match(rows,/aria-label="「出会い」（2022-05-03、関連：ロッキー（友人））を削除"/);
 assert.match(rows,/aria-label="「出会い」（2022-05-03、関連：ロッキー（ペット））を削除"/);
 setCanClear(false);
 get('eventRows').onclick({target:{dataset:{event:'1'}}});
 assert.deepEqual(snapshot(),before);
 assert.match(confirmMessages.at(-1),/2022-05-03 \/ 出会い \/ 過去の記録 \/ 0万円 \/ 関連：ロッキー（ペット）/);
 assert.match(confirmMessages.at(-1),/元に戻せません/);
 setCanClear(true);
 get('eventRows').onclick({target:{dataset:{event:'1'}}});
 assert.equal(snapshot().events.length,1);
 assert.equal(snapshot().events[0].personId,'f1');
 assert.equal(snapshot().events[0].note,'友人との思い出');
});

test('family deletion confirmation identifies same-name pet and counts both event links', () => {
  const {get,restore,snapshot,setCanClear,confirmMessages}=app();
  const backup=snapshot();
  backup.families=[
    {id:'f1',name:'ロッキー',role:'友人',birth:'1990-01-01'},
    {id:'f2',name:'ロッキー',role:'ペット',birth:'2018-05-03'}
  ];
  backup.events=[
    {date:'2020-05-03',title:'出会い',type:'past',amount:0,repeat:'once',personId:'f2',note:'大切'},
    {date:'2021-05-03',title:'散歩',type:'past',amount:0,repeat:'once',personId:'f1',secondPersonId:'f2'}
  ];
  restore(backup);
  const before=snapshot();
  setCanClear(false);
  get('familyList').onclick({target:{dataset:{family:'1'}}});
  assert.match(confirmMessages.at(-1),/ロッキー（ペット・2018-05-03）/);
  assert.match(confirmMessages.at(-1),/関連する出来事：2件/);
  assert.match(confirmMessages.at(-1),/元に戻せません/);
  assert.deepEqual(snapshot(),before);
  setCanClear(true);
  get('familyList').onclick({target:{dataset:{family:'1'}}});
  const after=snapshot();
  assert.equal(after.families.length,1);
  assert.equal(after.families[0].id,'f1');
  assert.equal(after.events.length,2);
  assert.equal(after.events[0].personId,undefined);
  assert.equal(after.events[0].note,'大切');
  assert.equal(after.events[1].personId,'f1');
  assert.equal(after.events[1].secondPersonId,undefined);
});

test('family deletion with no linked events reports zero without changing unrelated memory', () => {
  const {get,restore,snapshot,confirmMessages}=app();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'家族',role:'兄弟',birth:'1980-01-01'}];
  backup.events=[{date:'2020-01-01',title:'自分の記録',type:'past',amount:0,repeat:'once',personId:'self'}];
  restore(backup);
  const before=snapshot();
  get('familyList').onclick({target:{dataset:{family:'0'}}});
  assert.match(confirmMessages.at(-1),/家族（兄弟・1980-01-01）/);
  assert.match(confirmMessages.at(-1),/関連する出来事：0件/);
  assert.equal(snapshot().families.length,0);
  assert.deepEqual(snapshot().events,before.events);
});


test('editing a linked event changes only that record and preserves backup version', () => {
  const {get,restore,snapshot}=app();
  const backup=snapshot();
  backup.families=[
    {id:'f1',name:'ロッキー',role:'友人',birth:'2000-01-01'},
    {id:'f2',name:'ロッキー',role:'ペット',birth:'2018-05-03'}
  ];
  backup.events=[
    {date:'2030-05-01',title:'出会い',type:'future',amount:-5,repeat:'once',personId:'f1',note:'友人'},
    {date:'2030-05-01',title:'出会い',type:'future',amount:-3,repeat:'once',personId:'f2',note:'ペット'}
  ];
  restore(backup);
  const first=structuredClone(snapshot().events[0]);
  assert.match(get('eventRows').innerHTML,/data-event-edit="1"/);
  get('eventRows').onclick({target:{dataset:{eventEdit:'1'}}});
  assert.equal(get('eventTitle').value,'出会い');
  assert.equal(get('eventPerson').value,'f2');
  assert.equal(get('addEvent').textContent,'変更を保存');
  assert.equal(get('cancelEventEdit').hidden,false);
  get('eventTitle').value='新しい <記録>';
  get('eventAmount').value='-9';
  get('eventNote').value='忘れない & 大切';
  get('eventPerson2').value='f1';
  get('addEvent').onclick();
  const after=snapshot();
  assert.equal(after.version,1);
  assert.equal(after.events.length,2);
  assert.deepEqual(after.events[0],first);
  assert.equal(after.events[1].title,'新しい <記録>');
  assert.equal(after.events[1].amount,-9);
  assert.equal(after.events[1].note,'忘れない & 大切');
  assert.equal(after.events[1].personId,'f2');
  assert.equal(after.events[1].secondPersonId,'f1');
  assert.match(get('eventRows').innerHTML,/新しい &lt;記録&gt;/);
  assert.doesNotMatch(get('eventRows').innerHTML,/<記録>/);
  assert.equal(get('addEvent').textContent,'イベントを追加');
  assert.equal(get('cancelEventEdit').hidden,true);
  assert.match(get('stats').innerHTML,/最終純資産/);
});

test('invalid event edits and cancel leave the original memory unchanged', () => {
  const {get,restore,snapshot,alerts}=app();
  const backup=snapshot();
  backup.events=[{date:'2020-01-01',title:'大切な日',type:'past',amount:0,repeat:'once',note:'その日の気持ち'}];
  restore(backup);
  const before=snapshot();
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  assert.equal(get('eventNote').value,'その日の気持ち');
  get('eventTitle').value='';
  get('addEvent').onclick();
  assert.match(alerts.at(-1),/イベント名/);
  assert.deepEqual(snapshot(),before);
  assert.equal(get('cancelEventEdit').hidden,false);
  get('cancelEventEdit').onclick();
  assert.deepEqual(snapshot(),before);
  assert.equal(get('eventTitle').value,'');
  assert.equal(get('addEvent').textContent,'イベントを追加');
  assert.equal(get('cancelEventEdit').hidden,true);
});

test('deleting another event while editing waits until edit is saved or cancelled', () => {
  const {get,restore,snapshot}=app();
  const backup=snapshot();
  backup.events=['最初','途中','最後'].map((title,i)=>({
    date:'2030-05-0'+(i+1),title,type:'future',amount:0,repeat:'once'
  }));
  restore(backup);
  get('eventRows').onclick({target:{dataset:{eventEdit:'2'}}});
  get('eventRows').onclick({target:{dataset:{event:'0'}}});
  assert.deepEqual(snapshot().events.map(e=>e.title),['最初','途中','最後']);
  get('eventTitle').value='最後だけ更新';
  get('addEvent').onclick();
  assert.deepEqual(snapshot().events.map(e=>e.title),['最初','途中','最後だけ更新']);
  get('eventRows').onclick({target:{dataset:{event:'0'}}});
  assert.deepEqual(snapshot().events.map(e=>e.title),['途中','最後だけ更新']);
  get('eventRows').onclick({target:{dataset:{eventEdit:'1'}}});
  get('eventRows').onclick({target:{dataset:{event:'1'}}});
  assert.deepEqual(snapshot().events.map(e=>e.title),['途中','最後だけ更新']);
  get('cancelEventEdit').onclick();
  get('eventRows').onclick({target:{dataset:{event:'1'}}});
  assert.deepEqual(snapshot().events.map(e=>e.title),['途中']);
  assert.equal(get('addEvent').textContent,'イベントを追加');
  assert.equal(get('cancelEventEdit').hidden,true);
});

test('successful restore clears stale event draft and prevents accidental duplicate', () => {
  const {get,restore,snapshot,alerts}=app();
  const backup=snapshot();
  backup.events=[{date:'2030-01-01',title:'元の記録',type:'future',amount:0,repeat:'once'}];
  restore(backup);
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  get('eventTitle').value='保存していない変更';
  const replacement=snapshot();
  replacement.events[0].title='バックアップの記録';
  restore(replacement);
  assert.equal(snapshot().events[0].title,'バックアップの記録');
  assert.equal(get('addEvent').textContent,'イベントを追加');
  assert.equal(get('cancelEventEdit').hidden,true);
  assert.equal(get('eventTitle').value,'');
  assert.equal(get('eventDate').value,'');
  assert.equal(get('eventNote').value,'');
  assert.equal(get('eventAmount').value,'0');
  assert.equal(get('eventPerson').value,'');
  assert.equal(get('eventPerson2').value,'');
  const restored=snapshot();
  get('addEvent').onclick();
  assert.match(alerts.at(-1),/正しい日付とイベント名/);
  assert.deepEqual(snapshot(),restored);
});


test('editing an event at the 2000-item limit succeeds while a new event is rejected', () => {
  const {get,restore,snapshot,alerts}=app();
  const backup=snapshot();
  backup.events=Array.from({length:2000},(_,i)=>({
    date:'2020-01-01',title:'記録'+i,type:'past',amount:0,repeat:'once'
  }));
  restore(backup);
  assert.equal(snapshot().events.length,2000);
  get('eventRows').onclick({target:{dataset:{eventEdit:'1999'}}});
  assert.equal(get('addEvent').textContent,'変更を保存');
  get('eventTitle').value='修正した思い出';
  get('addEvent').onclick();
  const edited=snapshot();
  assert.equal(edited.events.length,2000);
  assert.equal(edited.events[1999].title,'修正した思い出');
  assert.equal(edited.events[1998].title,'記録1998');
  assert.equal(get('cancelEventEdit').hidden,true);
  get('eventDate').value='2020-01-01';
  get('eventTitle').value='追加不可';
  get('eventType').value='past';
  get('eventAmount').value='0';
  get('addEvent').onclick();
  assert.match(alerts.at(-1),/2000件/);
  assert.equal(snapshot().events.length,2000);
});

test('invalid edit at the 2000-item limit remains editable without mutating memories', () => {
  const {get,restore,snapshot,alerts}=app();
  const backup=snapshot();
  backup.events=Array.from({length:2000},(_,i)=>({
    date:'2020-01-01',title:'記録'+i,type:'past',amount:0,repeat:'once'
  }));
  restore(backup);
  const before=snapshot().events[0];
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  get('eventTitle').value='';
  get('addEvent').onclick();
  assert.match(alerts.at(-1),/イベント名/);
  assert.equal(snapshot().events.length,2000);
  assert.deepEqual(snapshot().events[0],before);
  assert.equal(get('cancelEventEdit').hidden,false);
  get('cancelEventEdit').onclick();
  assert.equal(get('cancelEventEdit').hidden,true);
  assert.deepEqual(snapshot().events[0],before);
});

test('event edit focuses the input above the list without changing the record', () => {
  const {get,restore,snapshot}=app();
  const backup=snapshot();
  backup.events=[{date:'2030-04-01',title:'家族の予定',type:'future',amount:0,repeat:'once'}];
  restore(backup);
  const before=snapshot();
  let focusCount=0;
  get('eventTitle').focus=()=>{focusCount++};
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  assert.equal(focusCount,1);
  assert.equal(get('eventTitle').value,'家族の予定');
  assert.equal(get('addEvent').textContent,'変更を保存');
  assert.deepEqual(snapshot(),before);
  get('cancelEventEdit').onclick();
  assert.deepEqual(snapshot(),before);
});

test('editing an event blocks local backup until changes are saved', () => {
  const {get,restore,snapshot,storage,confirmMessages}=app();
  const backup=snapshot();
  backup.events=[{date:'2030-04-01',title:'元の予定',type:'future',amount:0,repeat:'once'}];
  restore(backup);
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  get('eventTitle').value='修正した予定';
  let writes=0;
  storage.setItem=()=>{writes++};
  const confirmsBefore=confirmMessages.length;
  get('save').onclick();
  assert.equal(writes,0);
  assert.equal(confirmMessages.length,confirmsBefore);
  assert.equal(snapshot().events[0].title,'元の予定');
  assert.match(get('message').textContent,/イベントを編集中.*変更を保存/);
  get('addEvent').onclick();
  get('save').onclick();
  assert.equal(writes,1);
  assert.equal(snapshot().events[0].title,'修正した予定');
});

test('editing an event blocks JSON export until edit is cancelled', () => {
  const {get,restore,snapshot,exports,confirmMessages}=app();
  const backup=snapshot();
  backup.events=[{date:'2030-04-01',title:'元の思い出',type:'future',amount:0,repeat:'once'}];
  restore(backup);
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  get('eventTitle').value='未保存の修正';
  const confirmsBefore=confirmMessages.length;
  get('export').onclick();
  assert.equal(exports.downloads.length,0);
  assert.equal(exports.exportBlobs.length,0);
  assert.equal(confirmMessages.length,confirmsBefore);
  assert.match(get('message').textContent,/イベントを編集中.*編集をやめる/);
  get('cancelEventEdit').onclick();
  get('export').onclick();
  assert.equal(exports.downloads.length,1);
  assert.equal(JSON.parse(exports.exportBlobs[0].content).events[0].title,'元の思い出');
});


test('failed restore keeps the event edit draft and controls intact', () => {
  const {get,restore,snapshot}=app();
  const backup=snapshot();
  backup.events=[{date:'2030-01-01',title:'元の予定',type:'future',amount:0,repeat:'once'}];
  restore(backup);
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  get('eventTitle').value='編集中の予定';
  get('eventNote').value='残しておきたい気持ち';
  const before=snapshot();
  const invalid=structuredClone(before);
  invalid.fields.wageGrowth='-200';
  assert.throws(()=>restore(invalid),/復元データの試算条件/);
  assert.deepEqual(snapshot(),before);
  assert.equal(get('eventTitle').value,'編集中の予定');
  assert.equal(get('eventNote').value,'残しておきたい気持ち');
  assert.equal(get('addEvent').textContent,'変更を保存');
  assert.equal(get('cancelEventEdit').hidden,false);
});

test('successful restore clears stale family registration draft', () => {
  const {get,restore,snapshot,alerts}=app();
  get('familyName').value='以前の家族';
  get('familyRole').value='友人';
  get('familyBirth').value='2000-01-01';
  const backup=snapshot();
  backup.families=[{name:'新しい家族',role:'家族',birth:'1995-05-05'}];
  restore(backup);
  assert.equal(get('familyName').value,'');
  assert.equal(get('familyRole').value,'');
  assert.equal(get('familyBirth').value,'');
  const before=snapshot();
  get('addFamily').onclick();
  assert.match(alerts.at(-1),/呼び名/);
  assert.deepEqual(snapshot(),before);
});

test('failed restore preserves family registration draft', () => {
  const {get,restore,snapshot}=app();
  get('familyName').value='入力途中の家族';
  get('familyRole').value='親友';
  get('familyBirth').value='2000-02-29';
  const before=snapshot();
  const invalid=structuredClone(before);
  invalid.fields.wageGrowth='-200';
  assert.throws(()=>restore(invalid),/復元データの試算条件/);
  assert.equal(get('familyName').value,'入力途中の家族');
  assert.equal(get('familyRole').value,'親友');
  assert.equal(get('familyBirth').value,'2000-02-29');
  assert.deepEqual(snapshot(),before);
});

test('successful family addition clears draft and blocks accidental duplicate tap', () => {
  const {get,snapshot,alerts}=app();
  get('familyName').value='ロッキー';
  get('familyRole').value='ペット';
  get('familyBirth').value='2018-05-03';
  get('addFamily').onclick();
  const after=snapshot();
  assert.deepEqual(after.families,[{name:'ロッキー',role:'ペット',birth:'2018-05-03'}]);
  assert.equal(get('familyName').value,'');
  assert.equal(get('familyRole').value,'');
  assert.equal(get('familyBirth').value,'');
  get('addFamily').onclick();
  assert.deepEqual(snapshot(),after);
  assert.match(alerts.at(-1),/呼び名/);
});

test('invalid family addition retains draft for correction and clears only on success', () => {
  const {get,snapshot,alerts}=app();
  get('familyName').value='友人';
  get('familyRole').value='親友';
  get('familyBirth').value='2999-01-01';
  get('addFamily').onclick();
  assert.equal(snapshot().families.length,0);
  assert.match(alerts.at(-1),/生年月日/);
  assert.equal(get('familyName').value,'友人');
  assert.equal(get('familyRole').value,'親友');
  assert.equal(get('familyBirth').value,'2999-01-01');
  get('familyBirth').value='2000-01-01';
  get('addFamily').onclick();
  assert.equal(snapshot().families.length,1);
  assert.equal(get('familyName').value,'');
  assert.equal(get('familyRole').value,'');
  assert.equal(get('familyBirth').value,'');
});


test('switching to another event while editing keeps the unsaved draft', () => {
  const {get,restore,snapshot}=app();
  const backup=snapshot();
  backup.events=[
    {date:'2030-01-01',title:'最初の記録',type:'future',amount:0,repeat:'once'},
    {date:'2030-02-01',title:'次の記録',type:'future',amount:0,repeat:'once'}
  ];
  restore(backup);
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  get('eventTitle').value='まだ保存していない変更';
  get('eventNote').value='残したい気持ち';
  const before=snapshot();
  let focusCount=0;
  get('eventTitle').focus=()=>{focusCount++};
  get('eventRows').onclick({target:{dataset:{eventEdit:'1'}}});
  assert.equal(get('eventTitle').value,'まだ保存していない変更');
  assert.equal(get('eventNote').value,'残したい気持ち');
  assert.equal(get('addEvent').textContent,'変更を保存');
  assert.match(get('message').textContent,/イベントを編集中.*変更を保存/);
  assert.equal(focusCount,1);
  assert.deepEqual(snapshot(),before);
  get('addEvent').onclick();
  assert.equal(snapshot().events[0].title,'まだ保存していない変更');
  get('eventRows').onclick({target:{dataset:{eventEdit:'1'}}});
  assert.equal(get('eventTitle').value,'次の記録');
});

test('reopening the same event while editing does not erase a draft', () => {
  const {get,restore,snapshot}=app();
  const backup=snapshot();
  backup.events=[{date:'2030-03-01',title:'大切な日',type:'future',amount:0,repeat:'once'}];
  restore(backup);
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  get('eventTitle').value='編集中の題名';
  get('eventAmount').value='-12';
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  assert.equal(get('eventTitle').value,'編集中の題名');
  assert.equal(get('eventAmount').value,'-12');
  assert.equal(snapshot().events[0].title,'大切な日');
  get('cancelEventEdit').onclick();
  assert.equal(snapshot().events[0].title,'大切な日');
  assert.equal(get('addEvent').textContent,'イベントを追加');
});


test('deleting the event being edited is blocked without losing unsaved memories', () => {
  const {get,restore,snapshot,confirmMessages}=app();
  const backup=snapshot();
  backup.events=[{date:'2030-01-01',title:'元の思い出',type:'future',amount:0,repeat:'once'}];
  restore(backup);
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  get('eventTitle').value='未保存の思い出';
  get('eventNote').value='大切な気持ち';
  const before=snapshot(),confirms=confirmMessages.length;
  let focused=0;
  get('eventTitle').focus=()=>{focused++};
  get('eventRows').onclick({target:{dataset:{event:'0'}}});
  assert.deepEqual(snapshot(),before);
  assert.equal(confirmMessages.length,confirms);
  assert.equal(get('eventTitle').value,'未保存の思い出');
  assert.equal(get('eventNote').value,'大切な気持ち');
  assert.equal(get('addEvent').textContent,'変更を保存');
  assert.match(get('message').textContent,/イベントを編集中.*削除してください/);
  assert.equal(focused,1);
  get('addEvent').onclick();
  assert.equal(snapshot().events[0].title,'未保存の思い出');
});

test('deleting another event is blocked while editing, then works after cancellation', () => {
  const {get,restore,snapshot,confirmMessages}=app();
  const backup=snapshot();
  backup.events=[
    {date:'2030-01-01',title:'残す予定',type:'future',amount:0,repeat:'once'},
    {date:'2030-02-01',title:'削除予定',type:'future',amount:-1,repeat:'once'}
  ];
  restore(backup);
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  get('eventTitle').value='編集中の予定';
  const before=snapshot(),confirms=confirmMessages.length;
  get('eventRows').onclick({target:{dataset:{event:'1'}}});
  assert.deepEqual(snapshot(),before);
  assert.equal(confirmMessages.length,confirms);
  assert.equal(get('eventTitle').value,'編集中の予定');
  get('cancelEventEdit').onclick();
  get('eventRows').onclick({target:{dataset:{event:'1'}}});
  assert.equal(snapshot().events.length,1);
  assert.equal(snapshot().events[0].title,'残す予定');
  assert.equal(confirmMessages.length,confirms+1);
});

test('deleting a linked family member while editing keeps the event draft and associations intact', () => {
  const {get,restore,snapshot,confirmMessages}=app();
  const backup=snapshot();
  backup.families=[{id:'f1',name:'ロッキー',role:'ペット',birth:'2018-05-03'}];
  backup.events=[{date:'2030-05-03',title:'出会った日',type:'future',amount:0,repeat:'once',personId:'f1'}];
  restore(backup);
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  get('eventTitle').value='忘れたくない日';
  get('eventNote').value='まだ書きかけ';
  const before=snapshot(),confirms=confirmMessages.length;
  let focused=0;
  get('eventTitle').focus=()=>{focused++};
  get('familyList').onclick({target:{dataset:{family:'0'}}});
  assert.deepEqual(snapshot(),before);
  assert.equal(confirmMessages.length,confirms);
  assert.equal(get('eventTitle').value,'忘れたくない日');
  assert.equal(get('eventNote').value,'まだ書きかけ');
  assert.equal(get('eventPerson').value,'f1');
  assert.match(get('message').textContent,/イベントを編集中.*家族を削除/);
  assert.equal(focused,1);
  get('addEvent').onclick();
  assert.equal(snapshot().events[0].personId,'f1');
  assert.equal(snapshot().events[0].note,'まだ書きかけ');
});

test('deleting an unrelated family member is blocked during edit and works after cancellation', () => {
  const {get,restore,snapshot,confirmMessages}=app();
  const backup=snapshot();
  backup.families=[
    {id:'f1',name:'親友',role:'友人',birth:'2000-01-01'},
    {id:'f2',name:'別の家族',role:'家族',birth:'2001-01-01'}
  ];
  backup.events=[{date:'2030-01-01',title:'再会',type:'future',amount:0,repeat:'once',personId:'f1'}];
  restore(backup);
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  get('eventTitle').value='まだ編集途中';
  const before=snapshot(),confirms=confirmMessages.length;
  get('familyList').onclick({target:{dataset:{family:'1'}}});
  assert.deepEqual(snapshot(),before);
  assert.equal(confirmMessages.length,confirms);
  assert.equal(get('eventTitle').value,'まだ編集途中');
  get('cancelEventEdit').onclick();
  get('familyList').onclick({target:{dataset:{family:'1'}}});
  assert.equal(snapshot().families.length,1);
  assert.equal(snapshot().families[0].id,'f1');
  assert.equal(snapshot().events[0].personId,'f1');
  assert.equal(confirmMessages.length,confirms+1);
});

test('new event draft survives a cancelled switch to editing an existing event', () => {
  const {get,restore,snapshot,setCanClear,confirmMessages}=app();
  const backup=snapshot();
  backup.events=[{date:'2030-01-01',title:'保存済み',type:'future',amount:0,repeat:'once'}];
  restore(backup);
  get('eventDate').value='2031-02-03';
  get('eventTitle').value='新しい思い出';
  get('eventNote').value='まだ書きかけの気持ち';
  get('eventAmount').value='-5';
  const before=snapshot();
  setCanClear(false);
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  assert.deepEqual(snapshot(),before);
  assert.equal(get('eventDate').value,'2031-02-03');
  assert.equal(get('eventTitle').value,'新しい思い出');
  assert.equal(get('eventNote').value,'まだ書きかけの気持ち');
  assert.equal(get('eventAmount').value,'-5');
  assert.notEqual(get('addEvent').textContent,'変更を保存');
  assert.match(confirmMessages.at(-1),/新しいイベントの入力途中/);
  assert.match(get('message').textContent,/入力内容を保持/);
  get('addEvent').onclick();
  assert.equal(snapshot().events.length,2);
  assert.equal(snapshot().events[1].note,'まだ書きかけの気持ち');
});

test('accepting draft discard starts existing-event edit; empty draft needs no confirmation', () => {
  const {get,restore,snapshot,confirmMessages}=app();
  const backup=snapshot();
  backup.events=[{date:'2030-04-01',title:'保存済み',type:'future',amount:0,repeat:'once'}];
  restore(backup);
  get('eventTitle').value='新しい下書き';
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  assert.match(confirmMessages.at(-1),/入力内容を破棄/);
  assert.equal(get('eventTitle').value,'保存済み');
  assert.equal(get('addEvent').textContent,'変更を保存');
  get('cancelEventEdit').onclick();
  const count=confirmMessages.length;
  get('eventRows').onclick({target:{dataset:{eventEdit:'0'}}});
  assert.equal(confirmMessages.length,count);
  assert.equal(get('eventTitle').value,'保存済み');
});

test('successful new event registration clears the draft and prevents duplicate taps', () => {
  const {get,snapshot,alerts}=app();
  get('eventDate').value='2031-05-03';
  get('eventTitle').value='ロッキーとの思い出';
  get('eventType').value='future';
  get('eventAmount').value='-3';
  get('eventRepeat').value='annual';
  get('eventNote').value='大切な気持ち';
  get('eventPerson').value='self';
  get('addEvent').onclick();
  const saved=snapshot();
  assert.equal(saved.events.length,1);
  assert.equal(saved.events[0].note,'大切な気持ち');
  assert.equal(saved.events[0].personId,'self');
  assert.equal(get('eventDate').value,'');
  assert.equal(get('eventTitle').value,'');
  assert.equal(get('eventType').value,'future');
  assert.equal(get('eventAmount').value,'0');
  assert.equal(get('eventRepeat').value,'once');
  assert.equal(get('eventNote').value,'');
  assert.equal(get('eventPerson').value,'');
  assert.equal(get('eventPerson2').value,'');
  get('addEvent').onclick();
  assert.deepEqual(snapshot(),saved);
  assert.match(alerts.at(-1),/正しい日付とイベント名/);
});

test('invalid new event retains the draft for correction and clears it only after success', () => {
  const {get,snapshot,alerts}=app();
  get('eventDate').value='2030-02-30';
  get('eventTitle').value='卒業の記録';
  get('eventType').value='future';
  get('eventAmount').value='-10';
  get('eventNote').value='入力途中の気持ち';
  const before=snapshot();
  get('addEvent').onclick();
  assert.match(alerts.at(-1),/正しい日付とイベント名/);
  assert.deepEqual(snapshot(),before);
  assert.equal(get('eventTitle').value,'卒業の記録');
  assert.equal(get('eventNote').value,'入力途中の気持ち');
  assert.equal(get('eventAmount').value,'-10');
  get('eventDate').value='2030-02-28';
  get('addEvent').onclick();
  assert.equal(snapshot().events.length,1);
  assert.equal(snapshot().events[0].title,'卒業の記録');
  assert.equal(snapshot().events[0].note,'入力途中の気持ち');
  assert.equal(get('eventTitle').value,'');
  assert.equal(get('eventNote').value,'');
});

test('device save refuses unfinished family registration until the person is added', () => {
  const {get,storage,snapshot,confirmMessages}=app();
  let writes=0, saved;
  storage.setItem=(key,value)=>{writes++;saved=JSON.parse(value)};
  get('familyName').value='ロッキー';
  get('familyRole').value='ペット';
  get('familyBirth').value='2018-05-03';
  const before=snapshot(), confirmsBefore=confirmMessages.length;
  let focused=0;
  get('familyName').focus=()=>{focused++};
  get('save').onclick();
  assert.equal(writes,0);
  assert.equal(confirmMessages.length,confirmsBefore);
  assert.deepEqual(snapshot(),before);
  assert.equal(get('familyName').value,'ロッキー');
  assert.equal(get('familyBirth').value,'2018-05-03');
  assert.equal(focused,1);
  assert.match(get('message').textContent,/家族の入力途中.*家族を追加/);
  get('addFamily').onclick();
  get('save').onclick();
  assert.equal(writes,1);
  assert.equal(saved.families.length,1);
  assert.equal(saved.families[0].name,'ロッキー');
});

test('JSON export refuses a partial family draft and succeeds after clearing it', () => {
  const {get,exports,snapshot,confirmMessages}=app();
  get('familyRole').value='親友';
  const before=snapshot(), confirmsBefore=confirmMessages.length;
  let focused=0;
  get('familyName').focus=()=>{focused++};
  get('export').onclick();
  assert.equal(exports.downloads.length,0);
  assert.equal(exports.exportBlobs.length,0);
  assert.equal(confirmMessages.length,confirmsBefore);
  assert.deepEqual(snapshot(),before);
  assert.equal(get('familyRole').value,'親友');
  assert.equal(focused,1);
  assert.match(get('message').textContent,/家族の入力途中.*バックアップ/);
  get('familyRole').value='';
  get('export').onclick();
  assert.equal(exports.downloads.length,1);
  assert.equal(JSON.parse(exports.exportBlobs[0].content).version,1);
});


test('device save blocks unfinished new event and preserves it until registration', () => {
  const {get,storage,snapshot,confirmMessages}=app();
  let writes=0, saved;
  storage.setItem=(key,value)=>{writes++;saved=JSON.parse(value)};
  get('eventDate').value='2031-05-03';
  get('eventTitle').value='大切な思い出';
  get('eventNote').value='まだ入力途中の気持ち';
  get('eventAmount').value='-2';
  const before=snapshot(), confirmsBefore=confirmMessages.length;
  let focused=0;
  get('eventTitle').focus=()=>{focused++};
  get('save').onclick();
  assert.equal(writes,0);
  assert.equal(confirmMessages.length,confirmsBefore);
  assert.deepEqual(snapshot(),before);
  assert.equal(get('eventTitle').value,'大切な思い出');
  assert.equal(get('eventNote').value,'まだ入力途中の気持ち');
  assert.equal(focused,1);
  assert.match(get('message').textContent,/新しいイベントの入力途中.*イベントを追加/);
  get('addEvent').onclick();
  get('save').onclick();
  assert.equal(writes,1);
  assert.equal(saved.events.length,1);
  assert.equal(saved.events[0].note,'まだ入力途中の気持ち');
});

test('JSON export blocks partial event draft and succeeds after clearing it', () => {
  const {get,exports,snapshot,confirmMessages}=app();
  get('eventRepeat').value='annual';
  const before=snapshot(), confirmsBefore=confirmMessages.length;
  let focused=0;
  get('eventTitle').focus=()=>{focused++};
  get('export').onclick();
  assert.equal(exports.downloads.length,0);
  assert.equal(exports.exportBlobs.length,0);
  assert.equal(confirmMessages.length,confirmsBefore);
  assert.deepEqual(snapshot(),before);
  assert.equal(get('eventRepeat').value,'annual');
  assert.equal(focused,1);
  assert.match(get('message').textContent,/新しいイベントの入力途中.*バックアップ/);
  get('eventRepeat').value='once';
  get('export').onclick();
  assert.equal(exports.downloads.length,1);
  assert.equal(JSON.parse(exports.exportBlobs[0].content).version,1);
});
