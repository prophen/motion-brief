import {
  ArrowRight,
  Check,
  FileText,
  Image,
  Mic2,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '../components/ui'

const stages = [
  { label: 'Creative brief', icon: FileText },
  { label: 'Campaign visual', icon: Image },
  { label: 'Narration', icon: Mic2 },
] as const

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_24%,rgba(255,107,53,.16),transparent_26%),radial-gradient(circle_at_18%_80%,rgba(255,107,53,.07),transparent_28%)]" />

      <header className="relative border-b border-border/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link
            to="/"
            className="inline-flex min-h-6 items-center gap-2.5 font-semibold tracking-[-.02em]"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4" aria-hidden />
            </span>
            MotionBrief
          </Link>
          <div className="flex items-center gap-2">
            <Link
              className={buttonVariants({ variant: 'ghost' })}
              to="/projects"
            >
              Projects
            </Link>
            <Link className={buttonVariants({ size: 'sm' })} to="/home">
              Open Studio <ArrowRight aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto grid min-h-[calc(100vh-9rem)] max-w-7xl items-center gap-14 px-5 py-14 md:px-8 lg:grid-cols-[1.02fr_.98fr] lg:py-20">
          <div>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[.24em] text-primary">
              Prompt to campaign concept
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[.94] tracking-[-.06em] sm:text-6xl lg:text-7xl">
              Turn one rough idea into something you can see and hear.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
              MotionBrief shapes a creator prompt into an editable brief,
              campaign visual, five-second animation, narration, and final
              vertical MP4—all in one focused workspace.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link className={buttonVariants({ size: 'lg' })} to="/home?new=1">
                Create a concept <ArrowRight aria-hidden />
              </Link>
              <Link
                className={buttonVariants({ variant: 'outline', size: 'lg' })}
                to="/projects"
              >
                View projects
              </Link>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              You review and edit every field before generating paid assets.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:ml-auto">
            <div className="absolute -inset-5 rotate-2 rounded-[2rem] border border-primary/20 bg-primary/5" />
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-[0_30px_100px_rgba(0,0,0,.45)]">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <p className="text-xs uppercase tracking-[.18em] text-muted-foreground">
                    Concept preview
                  </p>
                  <p className="mt-1 font-medium">Moments You Can Hold</p>
                </div>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  Ready
                </span>
              </div>

              <div className="grid sm:grid-cols-[1fr_12rem]">
                <div className="p-5 sm:p-6">
                  <p className="text-xs font-medium text-muted-foreground">
                    Creator prompt
                  </p>
                  <p className="mt-3 text-base leading-relaxed">
                    “Make a pocket camera feel like the perfect companion for
                    spontaneous train journeys.”
                  </p>
                  <div className="mt-7 space-y-2.5">
                    {stages.map(({ label, icon: Icon }) => (
                      <div
                        key={label}
                        className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3"
                      >
                        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                          <Check className="size-4" aria-hidden />
                        </span>
                        <Icon
                          className="size-4 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative min-h-72 overflow-hidden border-t border-border bg-[#211d17] sm:min-h-0 sm:border-l sm:border-t-0">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,174,105,.65),transparent_23%),linear-gradient(160deg,#57442d_0%,#1b1915_55%,#090908_100%)]" />
                  <div className="absolute left-[16%] top-[18%] h-[42%] w-[70%] -rotate-6 border border-white/20 bg-white/5 shadow-2xl backdrop-blur-sm" />
                  <div className="absolute inset-x-5 bottom-6">
                    <p className="text-[9px] uppercase tracking-[.25em] text-white/55">
                      Campaign headline
                    </p>
                    <p className="mt-2 text-2xl font-black uppercase leading-[.9] tracking-[-.05em] text-white">
                      Hold every adventure
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-border/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8">
          <p>
            Built with four DeepSpace integrations that matter to the workflow.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 font-medium text-foreground">
            <span>OpenAI · Brief</span>
            <span>FAL · Visual + motion</span>
            <span>ElevenLabs · Voice</span>
            <span>Shotstack · Final MP4</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
