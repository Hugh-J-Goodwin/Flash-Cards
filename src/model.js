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
  return data;
}
export function removeSubject(data, subjectId) {
 const topics = new Set(data.topics.filter(t=>t.subjectId===subjectId).map(t=>t.id));
 return {...data,subjects:data.subjects.filter(s=>s.id!==subjectId),topics:data.topics.filter(t=>!topics.has(t.id)),cards:data.cards.filter(c=>!topics.has(c.topicId)),quizzes:data.quizzes.filter(q=>!topics.has(q.topicId))};
}
export function score(questions, answers) { return questions.reduce((n,q,i)=>n+(q.correct===answers[i]?1:0),0); }
