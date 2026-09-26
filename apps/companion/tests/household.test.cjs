const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const mod = {exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/household.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Date});
const {dateKey,weekDays,eventsForDay,validateEvent}=mod.exports;
test('week navigation handles month and year boundaries',()=>{
  const days=weekDays(new Date(2027,0,1,12));
  assert.equal(days.length,7);assert.equal(dateKey(days[0]),'2026-12-27');assert.equal(dateKey(days[6]),'2027-01-02');
});
test('agenda includes overnight events and excludes exclusive end boundary',()=>{
  const day=new Date(2026,8,25,12);
  const events=[{id:'overnight',startAt:new Date(2026,8,24,23).toISOString(),endAt:new Date(2026,8,25,1).toISOString()},
    {id:'ended',startAt:new Date(2026,8,24,12).toISOString(),endAt:new Date(2026,8,25,0).toISOString()}];
  assert.equal(eventsForDay(events,day).length,1);assert.equal(eventsForDay(events,day)[0].id,'overnight');
});
test('event editor rejects empty titles, reverse dates, and no assignees',()=>{
  const a=new Date(2026,8,25,12),b=new Date(2026,8,25,13);
  assert.ok(validateEvent(' ',a,b,['m']));assert.ok(validateEvent('Event',b,a,['m']));assert.ok(validateEvent('Event',a,b,[]));
  assert.equal(validateEvent('Event',a,b,['m']),null);
});
