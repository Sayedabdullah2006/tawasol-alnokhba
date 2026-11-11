import { NextRequest } from 'next/server'
import { runPublicationCron } from '@/lib/publication-plan-cron'
export const dynamic='force-dynamic'
export const maxDuration=300
export async function POST(req:NextRequest){return runPublicationCron(req,req.nextUrl.searchParams.get('task')||'generate')}
export async function GET(req:NextRequest){return runPublicationCron(req,req.nextUrl.searchParams.get('task')||'generate')}
