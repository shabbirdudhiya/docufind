
import React, { useState, useEffect } from 'react'

// Tips and facts to show during loading
const LOADING_TIPS = [
    { icon: '💡', text: 'Tip: Use quotes for exact phrase matching, e.g., "annual report"' },
    { icon: '🔍', text: 'DocuFind indexes content inside Word, PowerPoint, and Excel files' },
    { icon: '⚡', text: 'Your search index is saved automatically - no re-indexing needed!' },
    { icon: '📁', text: 'Tip: You can exclude specific folders from search results in Settings' },
    { icon: '🎯', text: 'Click any result to preview, or use "Open & Jump" to go directly to the match' },
    { icon: '🌙', text: 'Tip: Toggle dark mode in Settings for comfortable nighttime use' },
    { icon: '📊', text: 'DocuFind can search through thousands of documents in milliseconds' },
    { icon: '🔄', text: 'Enable File Watching to auto-update your index when files change' },
    { icon: '🌐', text: 'Arabic and RTL text is automatically detected and displayed correctly' },
    { icon: '⌨️', text: 'Tip: Press Enter to search, results appear instantly as you type' },
    { icon: '📝', text: 'Fun fact: The average office worker searches for files 8 times per day' },
    { icon: '🚀', text: 'DocuFind uses Tantivy, the same search engine tech as major search platforms' },
    { icon: '💾', text: 'Your index is stored locally - your documents never leave your computer' },
    { icon: '🎨', text: 'Tip: Change the preview font in the preview pane for better readability' },
    { icon: '📈', text: 'Fun fact: Workers spend 20% of their time searching for documents' },
]

export function RotatingTip() {
    const [currentTip, setCurrentTip] = useState(0)
    const [isVisible, setIsVisible] = useState(true)

    useEffect(() => {
        const interval = setInterval(() => {
            setIsVisible(false)
            setTimeout(() => {
                setCurrentTip((prev) => (prev + 1) % LOADING_TIPS.length)
                setIsVisible(true)
            }, 300)
        }, 4000)
        return () => clearInterval(interval)
    }, [])

    const tip = LOADING_TIPS[currentTip]

    return (
        <div className={`flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 transition-all duration-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
            <span className="text-base">{tip.icon}</span>
            <span>{tip.text}</span>
        </div>
    )
}
