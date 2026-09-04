import {
  ArrowRight,
  Check,
  Clapperboard,
  FileText,
  Image,
  Mic2,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '../components/ui'

const stages = [
  { label: 'Creative brief', icon: FileText },
  { label: 'Visual + motion style', icon: Image },
  { label: 'Narration', icon: Mic2 },
  { label: 'Final MP4', icon: Clapperboard },
] as const

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_24%,rgba(255,107,53,.16),transparent_26%),radial-gradient(circle_at_18%_80%,rgba(255,107,53,.07),transparent_28%)]" />

      <header className="safe-area-top relative border-b border-border/70">
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
            <a
              className={buttonVariants({ variant: 'ghost' })}
              href="/projects"
            >
              Projects
            </a>
            <a className={buttonVariants({ size: 'sm' })} href="/home">
              Open Studio <ArrowRight aria-hidden />
            </a>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto grid min-h-[calc(100vh-9rem)] max-w-7xl items-center gap-14 px-5 py-14 md:px-8 lg:grid-cols-[1.02fr_.98fr] lg:py-20">
          <div>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[.24em] text-primary">
              Prompt to campaign concept
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[.94] tracking-[-.025em] sm:text-6xl lg:text-7xl">
              Turn one rough idea into something you can see and hear.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
              MotionBrief shapes a creator prompt into an editable brief,
              campaign visual, reliable five-second camera move, narration, and
              final vertical MP4—all in one focused workspace.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a className={buttonVariants({ size: 'lg' })} href="/home?new=1">
                Create a concept <ArrowRight aria-hidden />
              </a>
              <a
                className={buttonVariants({ variant: 'outline', size: 'lg' })}
                href="/projects"
              >
                View projects
              </a>
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
                  <img
                    src="/landing-camera.webp"
                    alt="Instant camera on a train table in warm sunset light"
                    className="absolute inset-0 h-full w-full object-cover object-[center_68%]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/5" />
                  <div className="absolute right-3 top-3 rounded-full border border-white/30 bg-black/45 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.14em] text-white backdrop-blur-sm">
                    Slow push in
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
            <span>FAL · Visual</span>
            <span>ElevenLabs · Voice</span>
            <span>Shotstack · Final MP4</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
