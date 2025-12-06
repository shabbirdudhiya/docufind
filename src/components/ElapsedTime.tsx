
import React, { useState, useEffect } from 'react'

// Elapsed time component that updates every second
export function ElapsedTime({ startTime }: { startTime: Date }) {
    const [elapsed, setElapsed] = useState(0)

    useEffect(() => {
        const interval = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000))
        }, 1000)
        return () => clearInterval(interval)
    }, [startTime])

    const formatTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}m ${secs}s`
    }

    return (
        <p className="text-xs text-muted-foreground/60 mt-2">
            Elapsed: {formatTime(elapsed)}
            {elapsed > 30 && <span className="ml-2 text-yellow-500/80">• Large folder detected</span>}
        </p>
    )
}
