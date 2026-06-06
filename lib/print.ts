/**
 * Thermal Receipt Printing Utility
 * Uses browser window.print() with a dedicated receipt stylesheet.
 * Works with any 80mm/58mm USB or Bluetooth thermal printer configured as a system printer.
 */

interface ReceiptLine {
  label: string
  value: string
}

interface ReceiptData {
  venueName: string
  date: string
  items: ReceiptLine[]
  total: string
  paymentMethod: string
  footer?: string
}

export function printReceipt(data: ReceiptData) {
  const itemRows = data.items
    .map(i => `<tr><td>${escHtml(i.label)}</td><td class="right">${escHtml(i.value)}</td></tr>`)
    .join('')

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      width: 80mm;
      padding: 4mm;
      color: #000;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .title { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 4px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; }
    .total-row td { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 4px; }
    .footer { text-align: center; margin-top: 8px; font-size: 10px; }
    @media print {
      body { width: 80mm; }
    }
  </style>
</head>
<body>
  <div class="title">${escHtml(data.venueName)}</div>
  <div class="center">${escHtml(data.date)}</div>
  <div class="divider"></div>
  <table>
    <tbody>
      ${itemRows}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td>სულ:</td>
        <td class="right">${escHtml(data.total)}</td>
      </tr>
      <tr>
        <td>გადახდა:</td>
        <td class="right">${escHtml(data.paymentMethod)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="divider"></div>
  <div class="footer">${escHtml(data.footer ?? 'გმადლობთ! / Thank you!')}</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=340,height=600')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

/** Print a kitchen/bar ticket (no prices, just items + destination) */
export function printKitchenTicket(items: { name: string; qty: number }[], destination: string) {
  const rows = items
    .map(i => `<tr><td class="qty">${i.qty}×</td><td>${escHtml(i.name)}</td></tr>`)
    .join('')

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Kitchen Ticket</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 14px; width: 80mm; padding: 4mm; }
    .title { font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 6px; }
    .dest { text-align: center; font-size: 12px; margin-bottom: 6px; }
    .divider { border-top: 2px solid #000; margin: 6px 0; }
    table { width: 100%; }
    td { padding: 3px 0; }
    .qty { width: 32px; font-weight: bold; }
    .time { text-align: center; font-size: 11px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="title">🍹 BAR TICKET</div>
  <div class="dest">${escHtml(destination)}</div>
  <div class="divider"></div>
  <table><tbody>${rows}</tbody></table>
  <div class="divider"></div>
  <div class="time">${new Date().toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit' })}</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=340,height=400')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

function escHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
