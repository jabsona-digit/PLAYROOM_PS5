import * as XLSX from 'xlsx'

/**
 * Exports JSON data to an Excel file and triggers a browser download.
 */
export function exportToExcel(data: any[], fileName: string, sheetName: string = 'Sheet1') {
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, `${fileName}.xlsx`)
}

/**
 * Exports several named sheets into one workbook and triggers a download.
 * Sheet names are clamped to Excel's 31-char limit.
 */
export function exportWorkbook(fileName: string, sheets: { name: string; rows: any[] }[]) {
  const workbook = XLSX.utils.book_new()
  for (const s of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}])
    XLSX.utils.book_append_sheet(workbook, worksheet, s.name.slice(0, 31))
  }
  XLSX.writeFile(workbook, `${fileName}.xlsx`)
}

/**
 * Downloads a pre-defined Excel template for products or expenses.
 */
export function downloadTemplate(type: 'products' | 'expenses', existingCategories?: string[]) {
  let data: any[] = []
  let fileName = ''

  if (type === 'products') {
    const catHint = existingCategories && existingCategories.length > 0 
      ? `არსებული: ${existingCategories.slice(0, 5).join(', ')}${existingCategories.length > 5 ? '...' : ''}` 
      : 'მაგ: სასმელები'
      
    data = [
      {
        'დასახელება': 'მაგ: Coca-Cola 0.5L',
        'ბარკოდი': '123456789',
        'შესყიდვის ფასი': 1.2,
        'გასაყიდი ფასი': 2.5,
        'მარაგი': 50,
        'კატეგორია': catHint,
        'სურათის URL': 'https://example.com/image.jpg'
      }
    ]
    fileName = 'პროდუქტების_შაბლონი'
  } else if (type === 'expenses') {
    data = [
      {
        'კატეგორია': 'ქირა / ხელფასი / კომუნალური / მარაგები / მარკეტინგი / ტექმომსახურება / სხვა',
        'თანხა': 100.00,
        'თარიღი': new Date().toISOString().split('T')[0],
        'აღწერა': 'მაგ: ივნისის ქირა'
      }
    ]
    fileName = 'ხარჯების_შაბლონი'
  }

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template')
  XLSX.writeFile(workbook, `${fileName}.xlsx`)
}

/**
 * Reads an Excel file and returns JSON data.
 */
export async function readExcel(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const json = XLSX.utils.sheet_to_json(worksheet)
        resolve(json)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = (err) => reject(err)
    reader.readAsBinaryString(file)
  })
}
