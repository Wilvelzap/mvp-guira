import { jsPDF } from 'jspdf'

export interface PaymentDocData {
    id: string
    userName: string
    supplierName: string
    date: string
    amount: number
    currency: string
    fee: number
    netAmount: number
    exchangeRate?: number
    type: string
    rail?: string
    reference?: string
    paymentReason?: string
    isManual?: boolean
}

export function generatePaymentPDF(data: PaymentDocData) {
    const doc = new jsPDF()

    // Header
    doc.setFontSize(22)
    doc.setTextColor(30, 64, 175) // Primary color
    doc.text('GUIRA', 20, 20)

    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text('Documento de Respaldo de Operación', 20, 28)

    if (data.isManual) {
        doc.setFontSize(8)
        doc.setTextColor(153, 27, 27) // Red-800
        doc.text('EXPEDIENTE CREADO MANUALMENTE', 150, 28)
    }

    // Divider
    doc.setDrawColor(200)
    doc.line(20, 35, 190, 35)

    // Content
    doc.setFontSize(12)
    doc.setTextColor(0)

    let y = 50
    const addRow = (label: string, value: string) => {
        doc.setFont('helvetica', 'bold')
        doc.text(`${label}:`, 20, y)
        doc.setFont('helvetica', 'normal')
        doc.text(value, 80, y)
        y += 10
    }

    addRow('Referencia de Expediente', data.id)
    addRow('Sujeto de Operación', data.userName)
    addRow('Contraparte / Beneficiario', data.supplierName)
    addRow('Fecha de Gestión', new Date(data.date).toLocaleString())
    addRow('Riel Financiero', (data.type ? String(data.type).replace(/_/g, ' ') : '').toUpperCase())
    addRow('Volumen Declarado', `${data.amount.toLocaleString()} ${data.currency}`)

    if (data.exchangeRate && data.exchangeRate !== 1) {
        addRow('Tipo de Cambio', data.exchangeRate.toString())
    }

    addRow('Costo de Orquestación (Fees)', `${data.fee.toLocaleString()} ${data.currency}`)
    addRow('Volumen Verificado en Riel', `${data.netAmount.toLocaleString()} ${data.currency}`)
    if (data.rail) addRow('Riel de Salida', data.rail)
    if (data.reference) addRow('Referencia de Riel / Hash', data.reference)
    addRow('Justificación de Operación', data.paymentReason || 'Operación internacional documentada')

    // Footer
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text('Guira presta servicios de orquestación, validación y documentación de operaciones financieras.', 20, 270)
    doc.text('Guira no actúa como entidad financiera ni transmite fondos.', 20, 275)
    doc.text('Los movimientos de dinero fueron ejecutados directamente a través de los rieles financieros indicados.', 20, 280)
    doc.text(`Generado automáticamente por Guira el ${new Date().toLocaleString()}`, 20, 285)

    doc.save(`Expediente_Guira_${data.id.slice(0, 8)}.pdf`)
}
