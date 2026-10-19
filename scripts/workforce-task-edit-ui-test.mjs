// Read-only component regression: no HTTP, database or notification calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const source=readFileSync('src/components/workforce/TaskEditAction.tsx','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const loaded={exports:{}};new Function('require','module','exports',code)(require,loaded,loaded.exports);
const Action=loaded.exports.default;
const task={id:'existing-task',title:'مهمة قائمة',canEdit:true,column:{kind:'new'},archived_at:null,board:{archived_at:null}};
const props={task,base:'/employee/work/tasks'};
const html=renderToStaticMarkup(React.createElement(Action,props));
assert(html.includes('/employee/work/tasks/existing-task?panel=edit'));
assert(html.includes('تعديل وإعادة الإسناد'));
assert(!html.includes('disabled'));
assert.equal(renderToStaticMarkup(React.createElement(Action,{...props,task:{...task,canEdit:false}})),'');
for(const kind of ['review','done']){
 const frozen=renderToStaticMarkup(React.createElement(Action,{...props,task:{...task,column:{kind}}}));
 assert(frozen.includes('disabled'));assert(!frozen.includes('href='));
 assert(frozen.includes('قرار المدير'));
}
assert(renderToStaticMarkup(React.createElement(Action,{...props,task:{...task,archived_at:'2026-10-19'}})).includes('disabled'));
let opened,prevented=false;
const link=Action({...props,onOpen:(id,panel)=>{opened={id,panel};}});
link.props.onClick({button:0,preventDefault(){prevented=true;}});
assert.deepEqual(opened,{id:'existing-task',panel:'edit'});assert(prevented);
opened=null;prevented=false;
link.props.onClick({button:0,ctrlKey:true,preventDefault(){prevented=true;}});
assert.equal(opened,null);assert(!prevented);
console.log('PASS: delegated manager sees a working edit/reassign entry, regular employee does not, frozen states locked, embedded edit action and normal link navigation; no network calls');
