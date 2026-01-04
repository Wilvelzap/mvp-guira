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

    addRow('ID Operación', data.id)
    addRow('Cliente', data.userName)
    addRow('Proveedor', data.supplierName)
    addRow('Fecha', new Date(data.date).toLocaleDateString())
    addRow('Monto Original', `${data.amount.toLocaleString()} ${data.currency}`)

    if (data.exchangeRate && data.exchangeRate !== 1) {
        addRow('Tipo de Cambio', data.exchangeRate.toString())
    }

    addRow('Fee Guira', `${data.fee.toLocaleString()} ${data.currency}`)
    addRow('Monto Neto Pagado', `${data.netAmount.toLocaleString()} ${data.currency}`)
    addRow('Concepto', 'Pago de servicios / bienes')

    // Footer
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text('Este documento sirve como comprobante de transferencia y respaldo contable.', 20, 280)
    doc.text(`Generado automáticamente por Guira el ${new Date().toLocaleString()}`, 20, 285)

    doc.save(`Pago_Guira_${data.id.slice(0, 8)}.pdf`)
}
