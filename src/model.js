export const id = () => crypto.randomUUID();
export const empty = () => ({subjects: [], topics: [], cards: [], quizzes: []});
export function validate(data) {
  if (!data || !['subjects','topics','cards','quizzes'].every(k => Array.isArray(data[k]))) throw Error('This is not a Study Space backup.');
  const ids = new Set();
  for (const kind of ['subjects','topics','cards','quizzes']) for (const item of data[kind]) {
    if (!item || typeof item.id !== 'string' || ids.has(item.id)) throw Error('Invalid or duplicate record.');
    ids.add(item.id);
  }
  for (const s of data.subjects) if (typeof s.name !== 'string' || !s.name.trim()) throw Error('Invalid subject.');
  for (const t of data.topics) if (typeof t.name !== 'string' || !t.name.trim() || !data.subjects.some(s=>s.id===t.subjectId)) throw Error('Invalid topic.');
  const imageOK = x => !x || typeof x === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(x);
  for (const c of data.cards) if (!data.topics.some(t=>t.id===c.topicId) || typeof c.front!=='string' || typeof c.back!=='string' || !imageOK(c.frontImage) || !imageOK(c.backImage)) throw Error('Invalid flashcard.');
  for (const q of data.quizzes) if (!data.topics.some(t=>t.id===q.topicId) || typeof q.title!=='string' || !Array.isArray(q.questions) || !q.questions.length || q.questions.some(x=>typeof x.prompt!=='string'||!Array.isArray(x.options)||x.options.length!==4||x.options.some(o=>typeof o!=='string'||!o.trim())||!Number.isInteger(x.correct)||x.correct<0||x.correct>3)) throw Error('Invalid quiz.');
  for (const c of data.cards) if (c.review && (!Number.isFinite(c.review.due) || c.review.due < 0 || !Number.isFinite(c.review.interval) || c.review.interval <= 0 || !Number.isInteger(c.review.count) || c.review.count < 1 || !Number.isFinite(c.review.lastReviewed) || !['again','hard','easy'].includes(c.review.rating))) throw Error('Invalid review schedule.');
  if (data.attempts !== undefined && (!Array.isArray(data.attempts) || data.attempts.some(a=>!a || typeof a.id !== 'string' || typeof a.topicId !== 'string' || typeof a.title !== 'string' || !Number.isInteger(a.correct) || !Number.isInteger(a.total) || a.total < 1 || a.correct < 0 || a.correct > a.total || !Number.isFinite(a.at) || a.at < 0))) throw Error('Invalid quiz history.');
  return data;
}
export function removeSubject(data, subjectId) {
 const topics = new Set(data.topics.filter(t=>t.subjectId===subjectId).map(t=>t.id));
 return {...data,subjects:data.subjects.filter(s=>s.id!==subjectId),topics:data.topics.filter(t=>!topics.has(t.id)),cards:data.cards.filter(c=>!topics.has(c.topicId)),quizzes:data.quizzes.filter(q=>!topics.has(q.topicId))};
}
export function score(questions, answers) { return questions.reduce((n,q,i)=>n+(q.correct===answers[i]?1:0),0); }

export function dueCards(cards, now = Date.now()) {
 return cards.filter(c => !c.review || c.review.due <= now).sort((a,b)=>(a.review?.due || 0)-(b.review?.due || 0));
}
export function rateCard(card, rating, now = Date.now()) {
 if (!['again','hard','easy'].includes(rating)) throw Error('Unknown review rating.');
 const previous = card.review?.interval || 0;
 const interval = rating === 'again' ? 10 * 60 * 1000
   : rating === 'hard' ? Math.max(24 * 60 * 60 * 1000, Math.round(previous * 1.2))
   : Math.max(3 * 24 * 60 * 60 * 1000, Math.round(previous * 2.5));
 return {...card, review: {due: now + interval, interval, count: (card.review?.count || 0) + 1, lastReviewed: now, rating}};
}
export function topicStats(data, topicId, now = Date.now()) {
 const cards = data.cards.filter(c=>c.topicId===topicId);
 const attempts = (data.attempts || []).filter(a=>a.topicId===topicId);
 const total = attempts.reduce((n,a)=>n+a.total,0);
 return {cards: cards.length, due: dueCards(cards,now).length, reviewed: cards.filter(c=>c.review).length,
  attempts: attempts.length, accuracy: total ? Math.round(100 * attempts.reduce((n,a)=>n+a.correct,0) / total) : null};
}
