import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import * as pptx2json from 'pptx2json'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = file.name.toLowerCase()
    let content = ''

    if (filename.endsWith('.docx')) {
      // Extract content from Word document
      const result = await mammoth.extractRawText({ buffer })
      content = result.value
    } else if (filename.endsWith('.pptx')) {
      // Extract content from PowerPoint presentation
      try {
        const pptx = await pptx2json.parse(buffer)
        content = extractTextFromPptx(pptx)
      } catch (pptxError) {
        console.error('PPTX parsing error:', pptxError)
        // Fallback: try to extract as zip and read XML files
        content = await extractPptxContentFallback(buffer)
      }
    } else if (filename.endsWith('.txt') || filename.endsWith('.md')) {
      // Extract content from text file
      content = buffer.toString('utf-8')
    } else {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }

    return NextResponse.json({ 
      content: content.trim(),
      filename: file.name,
      size: file.size
    })

  } catch (error) {
    console.error('Content extraction error:', error)
    return NextResponse.json({ 
      error: 'Failed to extract content from file' 
    }, { status: 500 })
  }
}

function extractTextFromPptx(pptx: any): string {
  try {
    const textContent: string[] = []
    
    if (pptx.slides && Array.isArray(pptx.slides)) {
      pptx.slides.forEach((slide: any) => {
        if (slide.elements && Array.isArray(slide.elements)) {
          slide.elements.forEach((element: any) => {
            if (element.type === 'text' && element.content) {
              textContent.push(element.content)
            }
          })
        }
      })
    }
    
    return textContent.join('\n')
  } catch (error) {
    console.error('Error extracting text from PPTX:', error)
    return ''
  }
}

async function extractPptxContentFallback(buffer: Buffer): Promise<string> {
  try {
    // This is a simplified fallback - in a real implementation, you'd
    // properly parse the PPTX XML structure
    const text = buffer.toString('utf-8')
    // Extract text content from XML (basic approach)
    const textMatches = text.match(/<a:t>([^<]+)<\/a:t>/g) || []
    return textMatches.map((match: string) => 
      match.replace(/<\/?a:t>/g, '')
    ).join('\n')
  } catch (error) {
    console.error('Fallback PPTX extraction failed:', error)
    return ''
  }
}