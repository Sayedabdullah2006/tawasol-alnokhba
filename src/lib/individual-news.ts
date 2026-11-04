import { CATEGORIES } from './constants'
import { parseSubOption } from './auto-quote'
export function validateNews(category: string, rawSub: unknown) {
  if (!CATEGORIES.some(c => c.id === category && (!c.clientTypes || c.clientTypes.includes('individual')))) throw new Error('INVALID_CATEGORY')
  if (category === 'inventions' && !['with_patent','no_patent'].includes(String(rawSub))) throw new Error('INVALID_SUB_OPTION')
  if (category === 'competitions') {
    const sub = parseSubOption(rawSub as string)
    const positions: Record<string, string[]> = {
      international: ['first','second','third','top_10','top_50','participation'],
      local: ['first','second','third','top_10','top_50','participation'], hackathon: ['first','second','third','finalist','participation'],
    }
    if (!sub || typeof sub !== 'object' || !positions[sub.subcategory]?.includes(sub.position)) throw new Error('INVALID_SUB_OPTION')
  }
}