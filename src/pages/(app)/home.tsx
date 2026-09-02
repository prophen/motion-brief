/* home pattern: product-preview-first — editable brief and production rail above the fold */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuthProfileReady, useJobs, useMutations, useQuery } from 'deepspace'
import { Clapperboard, FileText, Image, Mic2, Play, Save, Sparkles } from 'lucide-react'
import { Button, Input, Label, Textarea, useToast } from '../../components/ui'
import { SCOPE_ID } from '../../constants'
import { countWords, narrationFitsFiveSeconds, NARRATION_HARD_MAX_WORDS } from '../../lib/narration'

type BriefResult = { projectId:string; pipelineVersion:number; assetManifest:unknown[]; brief:Pick<Project,'title'|'audience'|'objective'|'visualDirection'|'motionDirection'|'narration'|'headline'|'stillPrompt'|'motionPrompt'> }
type Project = { title:string; prompt:string; audience:string; objective:string; visualDirection:string; motionDirection:string; narration:string; headline:string; stillPrompt:string; motionPrompt:string; pipelineVersion:number; assetManifest:string; status:'draft'|'ready'|'rendering'|'complete' }
const seed: Project = { title:'Untitled motion brief', prompt:'', audience:'Curious creators on short-form video', objective:'Make one clear idea feel immediate and worth sharing.', visualDirection:'Editorial still, tactile light, one decisive focal point, portrait-safe composition.', motionDirection:'Slow push-in with restrained environmental movement; no cuts.', narration:'One idea. One frame. Ready to move.', headline:'MAKE THE IDEA MOVE', stillPrompt:'', motionPrompt:'', pipelineVersion:1, assetManifest:'[]', status:'draft' }
const steps = [['Brief',FileText],['Still',Image],['Motion',Play],['Voice',Mic2],['Render',Clapperboard]] as const

export default function HomePage() {
  const { isSignedIn } = useAuthProfileReady({ requireUser: true })
  const { records } = useQuery<Project>('motion-projects', { orderBy:'updatedAt', orderDir:'desc', limit:1 })
  const { createConfirmed, putConfirmed, ready } = useMutations<Project>('motion-projects')
  const { enqueue, jobs } = useJobs<unknown, BriefResult>(SCOPE_ID)
  const toast = useToast()
  const [draft,setDraft] = useState(seed), [recordId,setRecordId] = useState<string|null>(null)
  const [saving,setSaving] = useState(false), [queuing,setQueuing] = useState(false)
  const appliedJob = useRef<string|null>(null)
  const loadedRecord = useRef<string|null>(null)
  const stored = records[0], project = draft
  const job = useMemo(() => jobs.find(j => j.type === 'motionbrief-generate-brief' && (!recordId || (j.payload as {projectId?:string}|undefined)?.projectId === recordId)), [jobs,recordId])
  const set = <K extends keyof Project>(key:K,value:Project[K]) => setDraft(current => ({...current,[key]:value}))

  useEffect(()=>{
    if(!stored || loadedRecord.current===stored.recordId) return
    loadedRecord.current=stored.recordId
    setRecordId(stored.recordId)
    setDraft({...seed,...stored.data})
  },[stored])

  async function save() {
    if (!isSignedIn) return toast.info('Sign in to save','The studio preview is open; saving requires an account.')
    const values = project
    if (!values.prompt.trim()) return toast.error('Prompt required','Add the creator prompt before saving the brief.')
    if (!narrationFitsFiveSeconds(values.narration)) return toast.error('Narration timing','Use 8–13 words for a five-second read, or leave narration empty.')
    setSaving(true)
    try { if(recordId) await putConfirmed(recordId,{...values,status:'ready'}); else setRecordId(await createConfirmed({...values,status:'ready'})); setDraft({...values,status:'ready'}); toast.success('Brief saved','Your editable production brief is ready.') }
    catch(e){ toast.error('Could not save',e instanceof Error?e.message:'Please try again.') } finally { setSaving(false) }
  }
  async function preview(){ if(!isSignedIn||!recordId) return toast.info('Save first','Sign in and save the brief before previewing.'); setQueuing(true); try{ await enqueue('motionbrief-preview',{projectId:recordId,headline:draft.headline},{maxAttempts:1}); toast.success('Preview queued','Zero-cost orchestration only; no paid integrations called.') }catch(e){toast.error('Could not queue',e instanceof Error?e.message:'Please try again.')}finally{setQueuing(false)} }
  async function generateBrief(){ if(!isSignedIn||!recordId) return toast.info('Save first','Sign in and save your creator prompt first.'); setQueuing(true); try{ await enqueue('motionbrief-generate-brief',{projectId:recordId,prompt:project.prompt},{maxAttempts:1}); toast.success('AI brief queued','This owner-approved action makes one paid OpenAI request.') }catch(e){toast.error('Could not queue',e instanceof Error?e.message:'Please try again.')}finally{setQueuing(false)} }

  useEffect(()=>{ if(job?.status!=='succeeded'||!job.result||appliedJob.current===job.id) return; appliedJob.current=job.id; const next={...draft,...job.result.brief,pipelineVersion:job.result.pipelineVersion,assetManifest:JSON.stringify(job.result.assetManifest),status:'ready' as const}; setDraft(next); if(recordId) void putConfirmed(recordId,next).then(()=>toast.success('AI brief ready','Review and edit every field before generating assets.')).catch(e=>toast.error('Brief generated but not saved',e instanceof Error?e.message:'Save it manually.')) },[job,draft,putConfirmed,recordId,toast])

  return <div className="min-h-full bg-background text-foreground"><div className="mx-auto grid max-w-[1500px] lg:grid-cols-[minmax(0,1fr)_390px]">
    <section className="min-w-0 border-border lg:border-r"><header className="border-b border-border px-5 py-7 md:px-9"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-primary">Prompt to motion</p><h1 className="text-3xl font-semibold tracking-[-.04em] md:text-5xl">Build the brief. Ship the frame.</h1><p className="mt-3 text-muted-foreground">One surface for the idea, image, motion, voice, and vertical cut.</p></div><div className="flex gap-2"><Button variant="outline" onClick={save} loading={saving} disabled={!ready}><Save/>Save brief</Button><Button onClick={preview} loading={queuing}><Sparkles/>Preview pipeline</Button></div></div></header>
      <div className="grid gap-8 p-5 md:p-9 xl:grid-cols-[1fr_.72fr]"><div className="space-y-6"><Field label="Creator prompt"><Textarea value={project.prompt} onChange={e=>set('prompt',e.target.value)} placeholder="A launch film for a tiny camera that makes everyday walks feel cinematic…" className="min-h-36 bg-card text-lg leading-relaxed"/>{!project.prompt&&<p className="text-xs text-muted-foreground">Start with the raw thought. Every field remains editable.</p>}<Button className="mt-3" onClick={generateBrief} loading={queuing} disabled={!recordId}><Sparkles/>Generate AI brief</Button></Field><div className="grid gap-5 md:grid-cols-2"><Field label="Project name"><Input value={project.title} onChange={e=>set('title',e.target.value)}/></Field><Field label="Audience"><Input value={project.audience} onChange={e=>set('audience',e.target.value)}/></Field></div><Field label="Objective"><Textarea value={project.objective} onChange={e=>set('objective',e.target.value)} className="min-h-24 bg-card"/></Field><Field label="Visual direction"><Textarea value={project.visualDirection} onChange={e=>set('visualDirection',e.target.value)} className="min-h-24 bg-card"/></Field><Field label="Motion direction"><Textarea value={project.motionDirection} onChange={e=>set('motionDirection',e.target.value)} className="min-h-24 bg-card"/></Field><div className="grid gap-5 md:grid-cols-2"><Field label="Narration"><Textarea value={project.narration} onChange={e=>set('narration',e.target.value)} className="min-h-28 bg-card"/><p className={`text-xs ${countWords(project.narration)>NARRATION_HARD_MAX_WORDS?'text-destructive':'text-muted-foreground'}`}>{countWords(project.narration)} / {NARRATION_HARD_MAX_WORDS} words · target 8–11 · blank means silent</p></Field><Field label="Headline"><Textarea value={project.headline} onChange={e=>set('headline',e.target.value)} className="min-h-28 bg-card font-semibold uppercase"/></Field></div></div>
        <aside><div className="sticky top-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_70px_rgba(0,0,0,.28)]"><div className="relative aspect-[9/16] overflow-hidden bg-[#25221b]"><div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_24%,rgba(255,107,53,.5),transparent_28%),linear-gradient(145deg,#40372a_0%,#151511_58%,#080807_100%)]"/><div className="absolute left-[12%] top-[18%] h-[38%] w-[70%] rotate-[-8deg] border border-white/20 bg-white/5 backdrop-blur-sm"/><div className="absolute inset-x-7 bottom-16"><p className="text-[10px] uppercase tracking-[.28em] text-white/55">MotionBrief preview</p><p className="mt-3 text-4xl font-black uppercase leading-[.88] tracking-[-.055em] text-white">{project.headline||'Your headline'}</p></div></div><div className="flex justify-between border-t border-border p-4 text-xs text-muted-foreground"><span>9:16 · 5 seconds</span><span>Mock · $0.00</span></div></div></aside></div></section>
    <aside className="bg-shell p-5 md:p-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">Production rail</p><div className="mt-5 space-y-2">{steps.map(([label,Icon],i)=>{const active=i===0&&job&&['queued','running'].includes(job.status),done=i===0?job?.status==='succeeded'||project.status!=='draft':false;return <div key={label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5"><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${done?'bg-primary text-primary-foreground':'bg-secondary text-muted-foreground'}`}><Icon/></div><div className="flex-1"><p className="font-medium">{label}</p><p className="text-xs text-muted-foreground">{job?.status==='failed'&&i===0?job.error??'Failed':done?'Ready':active?job.progressMessage??'Working':i===0?'Editing':'Waiting'}</p></div><span className="text-xs text-muted-foreground">0{i+1}</span></div>})}</div><div className="mt-6 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">Brief generation enabled</p><p className="mt-1 leading-relaxed">OpenAI is enabled for the app owner. FAL, ElevenLabs, and Shotstack remain unwired and will not be called.</p></div></aside>
  </div></div>
}
function Field({label,children}:{label:string;children:ReactNode}){return <div className="space-y-2"><Label>{label}</Label>{children}</div>}
