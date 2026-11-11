import { NextRequest } from 'next/server'
import { runPublicationCron } from '@/lib/publication-plan-cron'
export const dynamic='force-dynamic'
export const maxDuration=300
/** Compatibility URL: free generation is retired, including force/count overrides. */
export async function GET(req:NextRequest){return runPublicationCron(req,'generate')}
export async function POST(req:NextRequest){return runPublicationCron(req,'generate')}
