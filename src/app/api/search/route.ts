import { NextRequest, NextResponse } from 'next/server'

interface SearchFile {
  id: string
  name: string
  type: 'word' | 'powerpoint' | 'text'
  content: string
}

interface SearchMatch {
  text: string
  index: number
  context: string
}

interface SearchResult {
  file: SearchFile
  matches: SearchMatch[]
  score: number
}

export async function POST(request: NextRequest) {
  try {
    const { query, files } = await request.json()

    if (!query || !files || !Array.isArray(files)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0)
    const results: SearchResult[] = []

    for (const file of files) {
      const content = file.content.toLowerCase()
      const matches: SearchMatch[] = []
      let totalScore = 0

      // Find all matches for each search term
      for (const term of searchTerms) {
        const termRegex = new RegExp(term, 'gi')
        let match
        
        while ((match = termRegex.exec(file.content)) !== null) {
          const startIndex = Math.max(0, match.index - 100)
          const endIndex = Math.min(file.content.length, match.index + match[0].length + 100)
          const context = file.content.substring(startIndex, endIndex)
          
          matches.push({
            text: match[0],
            index: match.index,
            context: context.trim()
          })
        }

        // Calculate term frequency score
        const termCount = (content.match(new RegExp(term, 'g')) || []).length
        totalScore += termCount
      }

      if (matches.length > 0) {
        // Calculate relevance score based on term frequency and density
        const contentLength = file.content.length
        const density = matches.length / (contentLength / 1000) // matches per 1000 chars
        const normalizedScore = Math.min(1, (totalScore * 0.7 + density * 0.3) / 10)
        
        // Sort matches by relevance (exact matches first, then by position)
        matches.sort((a, b) => {
          const aExact = searchTerms.some(term => a.text.toLowerCase() === term)
          const bExact = searchTerms.some(term => b.text.toLowerCase() === term)
          if (aExact && !bExact) return -1
          if (!aExact && bExact) return 1
          return a.index - b.index
        })

        results.push({
          file,
          matches: matches.slice(0, 10), // Limit to top 10 matches per file
          score: normalizedScore
        })
      }
    }

    // Sort results by relevance score
    results.sort((a, b) => b.score - a.score)

    return NextResponse.json({
      results,
      totalFiles: files.length,
      filesWithMatches: results.length,
      query
    })

  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ 
      error: 'Search failed' 
    }, { status: 500 })
  }
}