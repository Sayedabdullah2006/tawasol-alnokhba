'use client'
import {useCallback,useEffect,useState,useRef} from 'react'
import type {PublishedCatalog} from '@/lib/catalog/model'
export function useIndividualCatalog(initial?:PublishedCatalog|null){
 const generation=useRef(0)
 const [catalog,setCatalog]=useState<PublishedCatalog|null>(initial??null),[error,setError]=useState(false)
 const refresh=useCallback(async()=>{const current=++generation.current;try{const r=await fetch('/api/individual-catalog',{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();if(current===generation.current){setCatalog(data);setError(false)}}catch{if(current===generation.current)setError(true)}},[])
 useEffect(()=>{queueMicrotask(()=>void refresh());const focus=()=>{if(!document.hidden)void refresh()};const timer=setInterval(focus,60000);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);return()=>{clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}},[refresh])
 return {catalog,error,refresh}
}
