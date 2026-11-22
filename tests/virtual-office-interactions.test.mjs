import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import {
  officeFloor,
  officePath,
} from "../src/components/virtual-office/office-navigation.ts";
import { OFFICE_AGENTS, sessionSteps, currentAgent } from "../src/lib/virtual-office/domain.ts";
const source = await readFile(
  new URL("../src/lib/virtual-office/presentation.ts", import.meta.url),
  "utf8",
);
const code = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    'from "./domain"',
    `from "${new URL("../src/lib/virtual-office/domain.ts", import.meta.url).href}"`,
  );
const { plainOfficeText, firstName, officeActivities } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const planSource=await readFile(new URL('../src/lib/virtual-office/planning.ts',import.meta.url),'utf8');
const planCode=ts.transpileModule(planSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('from "./domain"',`from "${new URL('../src/lib/virtual-office/domain.ts',import.meta.url).href}"`);
const {parseOfficePlan}=await import(`data:text/javascript;base64,${Buffer.from(planCode).toString('base64')}`);
test('the approved route contains exactly the chosen specialists and rejects invalid plans',()=>{
 const plan={summary:'توجيه فني للنص المعتمد',steps:[{agentId:'art',reason:'المطلوب تصميم فقط',instruction:'جهزي اتجاه التصميم للنص المعتمد',deliverable:'توجيه فني وبرومبت'}],excluded:['researcher','writer','reviewer','publisher'].map(agentId=>({agentId,reason:'غير مطلوب في هذا التكليف'}))};
 assert.equal(parseOfficePlan(plan).steps.length,1);
 const s={kind:'team',agent_id:'editor',workflow:'adaptive',plan,status:'plan_review',step:1};
 assert.deepEqual(sessionSteps(s),['editor','art','editor']);assert.equal(currentAgent(s),'editor');assert.equal(currentAgent({...s,status:'running'}),'art');
 assert.deepEqual(sessionSteps({...s,plan:{...plan,steps:[]}}),['editor','editor']);
 for(const invalid of [{...plan,steps:[{...plan.steps[0],agentId:'shell'}]},{...plan,excluded:[]},{...plan,steps:[...plan.steps,...plan.steps]},{...plan,steps:[{...plan.steps[0],instruction:'ا'.repeat(1601)}]}])assert.throws(()=>parseOfficePlan(invalid));
 assert.equal(officeActivities([{...s,id:'plan',title:'توجيه فني'}],[]).find(a=>a.agentId==='editor').kind,'plan');
});
test("old responses become readable plain text while sources, hashtags and claims survive", () => {
  assert.equal(
    plainOfficeText(
      "### النتيجة\n**موثق**\n- [المصدر](https://example.com)\n#أول_سعودي\n`النص`",
    ),
    "النتيجة\nموثق\nالمصدر (https://example.com)\n#أول_سعودي\nالنص",
  );
  assert.equal(firstName("نور محمود باجنيد"), "نور");
  assert.equal(firstName("عبد الله محمد"), "عبد الله");
});
test("floor walks detour around the table, desks and coffee counter, including extended real staff rows", () => {
  const staff = Array.from({ length: 8 }, (_, i) => [
    ((i % 4) - 1.5) * 4.5,
    9 + Math.floor(i / 4) * 4,
  ]);
  const floor = officeFloor(
    [...OFFICE_AGENTS.map((a) => a.position), ...staff],
    8,
  );
  for (const destination of [
    { x: -3.8, z: -2.5 },
    { x: 3.8, z: 5.5 },
    { x: 0.6, z: -5.1 },
    { x: -7.9, z: -5.8 },
    { x: 6.75, z: 15 },
  ]) {
    const route = officePath(floor, { x: 0, z: 6.5 }, destination);
    assert.ok(route.length > 0);
    for (const p of route)
      assert.ok(floor.canStand(p), `blocked floor point ${JSON.stringify(p)}`);
    for (let i = 1; i < route.length; i++)
      assert.ok(
        Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z) <
          0.6,
        "no teleporting through furniture",
      );
  }
  const blocked = officePath(floor, { x: 0, z: 6.5 }, { x: 0, z: 1.2 });
  assert.ok(
    floor.canStand(blocked.at(-1)),
    "clicking furniture stops on walkable floor",
  );
});
test("speech bubbles preserve session/message links and put unapproved delivery at the editor desk", () => {
  const session = {
    id: "session-1",
    kind: "team",
    agent_id: "editor",
    status: "handoff",
    step: 2,
    title: "مهمة موثقة",
    brief: "جهز قصة",
  };
  const messages = [
    {
      id: "answer-2",
      session_id: session.id,
      agent_id: "researcher",
      kind: "assistant",
      content: "**تحققت** من المصدر",
      created_at: "2026-11-22T12:00:00Z",
    },
  ];
  const activity = officeActivities([session], messages);
  assert.equal(activity.find((a) => a.agentId === "editor").kind, "handoff");
  assert.equal(
    activity.find((a) => a.agentId === "editor").messageId,
    "answer-2",
  );
  assert.equal(
    activity.find((a) => a.agentId === "researcher").preview,
    "تحققت من المصدر",
  );
  assert.deepEqual(
    officeActivities([{ ...session, status: "cancelled" }], messages),
    [],
  );
});
