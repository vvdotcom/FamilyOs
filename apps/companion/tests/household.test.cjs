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
const {groceryPlan,pollTally,nextFamilyNight,starBalance}=mod.exports;
test('grocery review previews adds, combines, and already-listed items like the server',()=>{
  const household={meals:[{id:'m',title:'Pasta',recipeId:'r',ingredients:[]},{id:'plain',title:'Tacos',ingredients:['Tortillas',' ','Salsa']}],
    recipes:[{id:'r',name:'Pasta',ingredients:[{name:'Tomato',quantity:2,unit:'cups'},{name:'Pasta',quantity:1,unit:'lb'},{name:'tomato',quantity:1,unit:'cups'}],instructions:[],servings:4,source:''}],
    listItems:[{id:'a',listName:'Groceries',title:'Tomato',ingredientName:'tomato',unit:'cups',completed:false},{id:'b',listName:'Groceries',title:'Salsa',completed:false},{id:'c',listName:'Groceries',title:'Pasta',unit:'lb',completed:true}]};
  const plan=groceryPlan(household,'m');
  assert.equal(JSON.stringify(plan.map(l=>[l.name,l.quantity,l.action])),JSON.stringify([['Tomato',3,'combine'],['Pasta',1,'add']]));
  assert.equal(JSON.stringify(groceryPlan(household,'plain').map(l=>[l.name,l.action])),JSON.stringify([['Tortillas','add'],['Salsa','already-listed']]));
  assert.equal(groceryPlan(household,'missing').length,0);
});
test('family night helpers count votes and find the next night (Monday = 0)',()=>{
  const poll={suggestions:[{id:'a'},{id:'b'}],votes:{x:'a',y:'a',z:'b',w:'gone'}};
  assert.equal(JSON.stringify(pollTally(poll)),JSON.stringify({a:2,b:1}));
  assert.equal(nextFamilyNight({weekday:4},new Date(2026,8,22,9)),'2026-09-25');
  assert.equal(nextFamilyNight({weekday:1},new Date(2026,8,22,9)),'2026-09-22');
  assert.equal(nextFamilyNight({weekday:0},new Date(2026,8,22,9)),'2026-09-28');
  assert.equal(starBalance({starTransactions:[{memberId:'e',delta:5},{memberId:'e',delta:-2},{memberId:'l',delta:9}]},'e'),3);
});
