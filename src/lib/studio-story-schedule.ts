import type { LinkStory } from './studio-story-pipeline'

export interface StoryScheduleSelection { storyId: string; title: string; imageUrl: string; text: string }
export interface ScheduledStoryPost { imageUrl: string; text: string; when: string }

export function splitSuggestedTweets(value: string): string[] {
  const text = value.replace(/\r\n/g, '\n').trim()
  if (!text) return []
  // Only standalone suggestion markers, never years, scores or numbers inside the tweet.
  const marker = /^\s*(?:[-•]\s*)?(?:\*\*|__)?(?:التغريدة\s*|تغريدة\s*|الخيار\s*)?[1-3١-٣][.)\-:：]\s*(?:\*\*|__)?\s*/gm
  const matches = [...text.matchAll(marker)]
  if (matches.length >= 2) return matches.map((match, index) => text.slice(match.index! + match[0].length, matches[index + 1]?.index ?? text.length).trim()).filter(Boolean)
  if (matches.length === 1) return [text.slice(matches[0].index! + matches[0][0].length).trim()].filter(Boolean)
  // Keep multi-paragraph copy intact when the model did not provide explicit separators.
  return [text]
}

export function storyScheduleSelection(story: LinkStory): StoryScheduleSelection {
  const design = story.designs.find(item => item.imageUrl === story.selectedDesignUrl)
  if (!design) throw new Error('اختر تصميماً من تصاميم هذا الخبر أولاً')
  const text = story.selectedTweet?.trim()
  if (!text) throw new Error('اختر تغريدة أو اكتب نص المنشور لهذا الخبر أولاً')
  return { storyId: story.id, title: story.title, imageUrl: design.imageUrl, text }
}
