import { Check } from 'lucide-react'

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

interface SectionStepperProps {
  sections: { title: string; isComplete: boolean }[]
  currentIndex: number
  onStepClick: (index: number) => void
}

export function SectionStepper({
  sections,
  currentIndex,
  onStepClick,
}: SectionStepperProps) {
  return (
    <ScrollArea className="w-full" type="auto">
      <div className="flex items-start gap-0 px-2 py-3">
        {sections.map((section, index) => {
          const isCurrent = index === currentIndex
          const isComplete = section.isComplete

          return (
            <div key={index} className="flex items-start">
              {/* Step */}
              <button
                type="button"
                className="flex flex-col items-center gap-1.5 min-w-[5rem]"
                onClick={() => onStepClick(index)}
              >
                {/* Circle indicator */}
                <div
                  className={`flex size-9 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors ${
                    isCurrent
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isComplete
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-muted-foreground/30 bg-background text-muted-foreground'
                  }`}
                >
                  {isComplete ? (
                    <Check className="size-4" />
                  ) : (
                    index + 1
                  )}
                </div>

                {/* Section title */}
                <span
                  className={`text-xs text-center leading-tight max-w-[5rem] ${
                    isCurrent
                      ? 'font-semibold text-foreground'
                      : isComplete
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                  }`}
                >
                  {section.title}
                </span>
              </button>

              {/* Connector line */}
              {index < sections.length - 1 && (
                <div className="flex items-center self-start pt-[1.0625rem]">
                  <div
                    className={`h-px w-8 ${
                      section.isComplete
                        ? 'bg-green-600'
                        : 'bg-muted-foreground/30'
                    }`}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
