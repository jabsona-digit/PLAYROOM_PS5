// telegram-bot — Martelounge owner bot (Phase 1: link + pull stats).
//
// Webhook receiver. Deployed with --no-verify-jwt (Telegram sends no Supabase JWT);
// secured by the X-Telegram-Bot-Api-Secret-Token header (set at setWebhook time, stored
// as TELEGRAM_WEBHOOK_SECRET). Identifies the org by chat_id via service-role RPCs
// (migration 0100) — no user context — and replies in Georgian.
//
// Secrets: TELEGRAM_BOT_TOKEN (from BotFather), TELEGRAM_WEBHOOK_SECRET (any random string).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const api = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`

async function send(token: string, chatId: number, text: string) {
  await fetch(api(token, 'sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')

  // verify the webhook secret (set when registering the webhook)
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (secret && req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) {
    return new Response('forbidden', { status: 403 })
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) return new Response('ok')

  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let update: { message?: { chat?: { id?: number }; text?: string }; edited_message?: { chat?: { id?: number }; text?: string } }
  try { update = await req.json() } catch { return new Response('ok') }

  const msg = update.message ?? update.edited_message
  const chatId = msg?.chat?.id
  const text = (msg?.text ?? '').trim()
  if (!chatId || !text) return new Response('ok')

  const reply = (t: string) => send(token, chatId, t)
  const parts = text.split(/\s+/)
  const cmd = parts[0].toLowerCase().replace(/@.*$/, '') // strip @botname suffix

  try {
    if (cmd === '/start') {
      await reply(
        '👋 <b>Martelounge</b> ბოტი.\n\n' +
        'დასაკავშირებლად: ადმინ პანელში <b>პარამეტრები → Telegram</b> → „კოდის გენერაცია", მერე გამომიგზავნე:\n' +
        '<code>/link კოდი</code>\n\n' +
        'ბრძანებები: /revenue · /consoles · /help',
      )
      return new Response('ok')
    }

    if (cmd === '/link') {
      const code = parts[1] ?? ''
      if (!code) { await reply('გამოიყენე: <code>/link კოდი</code>\n(კოდი: პარამეტრები → Telegram)'); return new Response('ok') }
      const { data } = await svc.rpc('telegram_link', { p_chat_id: chatId, p_code: code })
      if ((data as { ok?: boolean })?.ok) {
        await reply(`✅ დაკავშირდა: <b>${(data as { org_name?: string }).org_name ?? ''}</b>\n\nსცადე: /revenue · /consoles`)
      } else {
        await reply('❌ კოდი არასწორია ან ვადაგასულია. პანელში დააგენერირე ახალი.')
      }
      return new Response('ok')
    }

    // everything else needs a linked org
    const { data: s } = await svc.rpc('telegram_org_summary', { p_chat_id: chatId })
    const sum = s as {
      linked?: boolean; org_name?: string; active_sessions?: number; free_consoles?: number
      total_consoles?: number; session_revenue_today?: number; bar_revenue_today?: number
    } | null
    if (!sum?.linked) {
      await reply('🔗 ჯერ დააკავშირე: პარამეტრები → Telegram → კოდი, მერე <code>/link კოდი</code>')
      return new Response('ok')
    }

    if (cmd === '/revenue' || cmd === '/today') {
      const sess = Number(sum.session_revenue_today ?? 0)
      const bar = Number(sum.bar_revenue_today ?? 0)
      await reply(
        `💰 <b>${sum.org_name}</b> — დღეს\n\n` +
        `🎮 სესიები: ₾${sess.toFixed(2)}\n` +
        `🍹 ბარი: ₾${bar.toFixed(2)}\n` +
        `<b>ჯამი: ₾${(sess + bar).toFixed(2)}</b>`,
      )
    } else if (cmd === '/consoles') {
      await reply(
        `🎮 <b>${sum.org_name}</b>\n\n` +
        `🟢 აქტიური: ${sum.active_sessions ?? 0}\n` +
        `⚪ თავისუფალი: ${sum.free_consoles ?? 0}/${sum.total_consoles ?? 0}`,
      )
    } else if (cmd === '/help') {
      await reply('ბრძანებები:\n/revenue — დღევანდელი შემოსავალი\n/consoles — კონსოლების სტატუსი\n/link კოდი — დაკავშირება')
    } else {
      await reply('არ მესმის 🤔 — სცადე /revenue · /consoles · /help')
    }
  } catch (_e) {
    await reply('დროებითი შეცდომა. სცადე ცოტა ხანში.')
  }

  return new Response('ok')
})
