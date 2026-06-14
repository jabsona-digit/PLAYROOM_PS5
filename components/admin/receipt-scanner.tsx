'use client'

import { useState, useRef } from 'react'
import { Camera, FileImage, LoaderCircle, Sparkles, X, UploadCloud } from 'lucide-react'
import { Modal } from './modal'
import { optimizeImage } from '@/lib/upload'
import { supabase } from '@/lib/supabase/client'
import { usePlayroom } from '@/lib/store'
import { cn } from '@/lib/utils'

interface ReceiptData {
  amount: number
  date: string
  category: string
  description: string
}

export function ReceiptScanner({ 
  onDetected, 
  onClose 
}: { 
  onDetected: (data: ReceiptData) => void, 
  onClose: () => void 
}) {
  const [scanning, setScanning] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { pushToast } = usePlayroom()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Show preview
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    
    setScanning(true)
    try {
      // 1. Optimize
      const optimized = await optimizeImage(file)
      
      // 2. To Base64
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(optimized)
      })
      const base64 = await base64Promise

      // 3. Call AI
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          messages: [
            {
              role: 'user',
              text: 'გააანალიზე ეს ჩეკი და დააბრუნე ინფორმაცია JSON ფორმატში: { amount: number, date: string (YYYY-MM-DD), category: string (rent|salary|utilities|supplies|marketing|maintenance|other), description: string }. დააბრუნე მხოლოდ JSON, სხვა ტექსტის გარეშე. თუ თარიღი გაურკვეველია გამოიყენე დღევანდელი.',
              image: base64
            }
          ]
        }
      })

      if (error) throw error
      
      // 4. Parse JSON from AI response
      const aiText = data.text || ''
      const jsonMatch = aiText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('მონაცემების ამოცნობა ვერ მოხერხდა')
      
      const parsed = JSON.parse(jsonMatch[0]) as ReceiptData
      
      // Add a small delay for "feeling" the AI work
      await new Promise(r => setTimeout(r, 800))
      
      onDetected(parsed)
      pushToast('success', 'ჩეკი წარმატებით დასკანერდა ✨')
      onClose()
    } catch (err: any) {
      console.error('OCR_ERROR', err)
      pushToast('danger', 'ჩეკის ამოცნობა ვერ მოხერხდა. სცადეთ სხვა ფოტო.')
      setPreview(null)
    } finally {
      setScanning(false)
      URL.revokeObjectURL(objectUrl)
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="ჩეკის სკანირება ✨">
      <div className="flex flex-col items-center gap-6 py-6 font-sans">
        
        {/* Visual Zone */}
        <div className={cn(
          "relative flex size-64 items-center justify-center rounded-[2.5rem] nm-inset overflow-hidden group",
          scanning && "animate-pulse"
        )}>
          {preview ? (
            <img src={preview} alt="Receipt preview" className="h-full w-full object-cover opacity-60 grayscale-[0.5]" />
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="nm-raised flex size-16 items-center justify-center rounded-2xl text-primary/40 group-hover:text-primary transition-colors">
                <Camera className="size-8" />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest">გადაუღე ჩეკს</p>
            </div>
          )}

          {scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/40 backdrop-blur-sm">
              <div className="relative">
                <LoaderCircle className="size-16 animate-spin text-primary" />
                <Sparkles className="absolute -right-2 -top-2 size-6 text-amber-400 animate-bounce" />
              </div>
              <p className="mt-4 text-sm font-black text-primary animate-pulse">AI აანალიზებს...</p>
            </div>
          )}
          
          <input 
            ref={fileRef}
            type="file" 
            accept="image/*" 
            capture="environment" 
            className="hidden" 
            onChange={handleFile}
            disabled={scanning}
          />
        </div>

        {/* Action Buttons */}
        <div className="grid w-full grid-cols-2 gap-4">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            className="nm-btn flex flex-col items-center gap-2 rounded-3xl py-6 transition-all hover:text-primary disabled:opacity-50"
          >
            <Camera className="size-6" />
            <span className="text-xs font-black uppercase">კამერა</span>
          </button>
          
          <button
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            className="nm-btn flex flex-col items-center gap-2 rounded-3xl py-6 transition-all hover:text-primary disabled:opacity-50"
          >
            <UploadCloud className="size-6" />
            <span className="text-xs font-black uppercase">გალერეა</span>
          </button>
        </div>

        <p className="text-center text-[10px] leading-relaxed text-muted-foreground uppercase tracking-wider max-w-[240px]">
          გადაუღეთ ჩეკს ისე, რომ თანხა და თარიღი ნათლად ჩანდეს. AI ავტომატურად შეავსებს ფორმას.
        </p>

        <button
          onClick={onClose}
          className="nm-btn mt-2 rounded-xl px-10 py-3 text-xs font-bold text-muted-foreground"
        >
          გაუქმება
        </button>
      </div>
    </Modal>
  )
}
