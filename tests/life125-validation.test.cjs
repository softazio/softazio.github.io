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
  const context = vm.createContext({document:{getElementById:get}});
  vm.runInContext(script, context, {timeout:3000});
  return {get, calculate:()=>vm.runInContext('calculate()', context, {timeout:3000}), restore:data=>{context.__backup=data;vm.runInContext('restore(__backup)',context,{timeout:3000})}, snapshot:()=>JSON.parse(vm.runInContext('JSON.stringify(snapshot())',context,{timeout:3000}))};
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
