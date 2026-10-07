import test from 'node:test'
import assert from 'node:assert/strict'
import { splitSuggestedTweets, storyScheduleSelection } from '../src/lib/studio-story-schedule.ts'

test('separates numbered suggestions while preserving paragraphs, hashtags and event years', () => {
  const text = '1. الباحث يحقق إنجازاً في 2026.\n\nتفاصيل الخبر الأول\n#First1Saudi\n\n2) سرد الخبر الثاني\n#الباحث\n\n3- خبر مختصر'
  assert.deepEqual(splitSuggestedTweets(text), ['الباحث يحقق إنجازاً في 2026.\n\nتفاصيل الخبر الأول\n#First1Saudi', 'سرد الخبر الثاني\n#الباحث', 'خبر مختصر'])
})
test('accepts Arabic numbering and markdown without including the choice label in the post', () => {
  assert.deepEqual(splitSuggestedTweets('**١.** الأول\n\n**٢.** الثاني\n\n**٣.** الثالث'), ['الأول', 'الثاني', 'الثالث'])
  assert.deepEqual(splitSuggestedTweets('التغريدة 1: الأول\nالتغريدة 2: الثاني'), ['الأول', 'الثاني'])
  assert.deepEqual(splitSuggestedTweets('خبر واحد\n\nتفاصيله\n#First1Saudi'), ['خبر واحد\n\nتفاصيله\n#First1Saudi'])
})
const story = (id, selectedTweet, selectedDesignUrl) => ({ id, title: `خبر ${id}`, content: '', images: [], selectedImages: [], sourceUrl: '', selected: true, designs: [{ title: 'اتجاه', brief: '', conceptIndex: 0, imageUrl: `https://example.com/${id}.png` }], selectedTweet, selectedDesignUrl })
test('schedule selection contains only the chosen text and design of the same story', () => {
  assert.deepEqual(storyScheduleSelection(story('first', ' تغريدة معدلة ', 'https://example.com/first.png')), { storyId: 'first', title: 'خبر first', imageUrl: 'https://example.com/first.png', text: 'تغريدة معدلة' })
  const second = storyScheduleSelection(story('second', 'نص الخبر الثاني', 'https://example.com/second.png'))
  assert.equal(second.text, 'نص الخبر الثاني')
  assert.equal(second.imageUrl, 'https://example.com/second.png')
})
test('rejects missing choices or a design from another news item', () => {
  assert.throws(() => storyScheduleSelection(story('first', 'نص', 'https://example.com/second.png')), /تصاميم هذا الخبر/)
  assert.throws(() => storyScheduleSelection(story('first', '  ', 'https://example.com/first.png')), /تغريدة/)
})
