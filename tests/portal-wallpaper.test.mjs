import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTAL_WALLPAPERS, choosePortalWallpaper, subscribePortalWallpaper, getPortalWallpaper, beginPortalVisit } from '../src/lib/portal-wallpaper.ts';
test('a new visit never repeats the preceding backdrop and only uses bundled assets',()=>{
 for(const prior of PORTAL_WALLPAPERS) for(const random of [0,.49,.99,1]) {
  const choice=choosePortalWallpaper(prior,()=>random);
  assert.ok(PORTAL_WALLPAPERS.includes(choice));assert.notEqual(choice,prior);
 }
});
test('navigation retains the visit backdrop and successful sign-in begins a different one',()=>{
 const old={window:globalThis.window,sessionStorage:globalThis.sessionStorage,localStorage:globalThis.localStorage};
 const memory=()=>{const map=new Map();return{getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)}};
 globalThis.sessionStorage=memory();globalThis.localStorage=memory();
 globalThis.window={addEventListener(){},removeEventListener(){},dispatchEvent(){}};
 try {subscribePortalWallpaper(()=>{});const first=getPortalWallpaper();subscribePortalWallpaper(()=>{});assert.equal(getPortalWallpaper(),first);beginPortalVisit();assert.notEqual(getPortalWallpaper(),first);const second=getPortalWallpaper();subscribePortalWallpaper(()=>{});assert.equal(getPortalWallpaper(),second);}
 finally {Object.assign(globalThis,old);}
});
