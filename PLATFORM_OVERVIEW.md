# Guira MVP - Manual de Operaciones y Estándares

Guira es una plataforma de **orquestación y documentación de flujos financieros**. 

> [!IMPORTANT]
> Guira **no es un banco**, no es una entidad financiera, no custodia fondos y no transmite dinero. El dinero siempre se mueve directamente entre el cliente y rieles financieros externos.

## ⚖️ Naturaleza del Servicio
Guira coordina, valida, documenta y da seguimiento a las operaciones, pero **no ejecuta transferencias por cuenta propia**. Los rieles financieros utilizados son:
- **ACH** (Transferencias bancarias EE.UU.)
- **SWIFT** (Transferencias bancarias internacionales)
- **PSAV** (Procesamiento local)
- **Redes Digitales** (Blockchain - USDC / USDT)

---

## 🚩 Regla Principal: Orden Primero
Toda operación en Guira **debe crear primero una Orden de Pago (PaymentOrder)**. Está prohibido mostrar instrucciones bancarias, QRs o cuentas sin que exista una `PaymentOrder` registrada.

### Entidad PaymentOrder
Es el corazón del sistema y debe existir para todos los casos con los siguientes campos obligatorios:
- `id`, `user_id`, `use_case`, `processing_rail`, `amount_origin`, `origin_currency`, `amount_converted`, `destination_currency`, `exchange_rate_applied`, `fee_total`, `beneficiary_id`, `status`, `created_at`, `updated_at`.

---

## � Estados de una Orden
Se utilizan exclusivamente los siguientes estados:

1.  **created**: Orden iniciada, esperando acción del cliente.
2.  **waiting_deposit**: Cliente notificó el envío y subió comprobante al riel.
3.  **deposit_received**: Fondos acreditados en el riel financiero correspondiente (Validado por Staff).
4.  **processing**: Operación confirmada por el cliente y en cola de ejecución externa.
5.  **sent**: Fondos enviados por el riel financiero externo.
6.  **completed**: Operación finalizada exitosamente con evidencias cargadas.
7.  **failed**: El depósito no llega, datos incorrectos, el riel rechaza la operación o el cliente no cumple requisitos.

---

## 🚀 Flujos Operativos

### 1. Bolivia → Exterior
1.  **Creación**: El cliente crea la orden indicando beneficiario y monto en Bs. Status: `created`, Riel: `PSAV`.
2.  **Instrucciones**: El sistema muestra el QR/Cuenta **PSAV**.
3.  **Fondeo**: El cliente deposita en el riel PSAV y sube el comprobante. Status: `waiting_deposit`.
4.  **Validación**: Staff valida acreditación en el riel PSAV, registra FX y comisión. Status: `processing`.
5.  **Ejecución**: Staff coordina envío final mediante riel correspondiente (SWIFT/Digital).
6.  **Cierre**: Se registra hash/referencia, se sube comprobante del riel y se genera el PDF. Status: `completed`.

### 2. EE.UU. → Wallet
- Cliente configura billetera/red. Se crea la `PaymentOrder`.
- Sistema muestra instrucciones **ACH**.
- Acreditación en riel ACH gatilla la coordinación del envío a la wallet. Status: `completed`.

### 3. Cripto → Cripto
- Selección de red/moneda y creación de `PaymentOrder`.
- **Revisión Final**: El cliente debe confirmar explícitamente el fee y la red antes de proceder.
- Registro de Hash y Status: `completed`.

### 4. Exterior → Bolivia
- El cliente indica monto y **debe subir obligatoriamente su QR bancario o datos bancarios completos**.
- Se crea la `PaymentOrder`.
- Staff valida origen de fondos y realiza depósito local en Bs.
- Cero custodia: Fondos acreditados directamente en el riel correspondiente. Status: `completed`.

---

## 📄 Reglas de Cumplimiento y Reporte

### Confirmación Final
Ninguna orden puede pasar a `processing` sin que el cliente confirme explícitamente: monto, tipo de cambio, comisión, riel utilizado y beneficiario final.

### Evidencias
No se permite el estado `completed` sin:
1.  Evidencia del cliente (cuando aplica).
2.  Evidencia del riel financiero externo.

### Texto Legal Obligatorio (PDF)
> Guira presta servicios de orquestación, validación y documentación de operaciones financieras. Guira no actúa como entidad financiera ni transmite fondos. Los movimientos de dinero fueron ejecutados directamente a través de los rieles financieros indicados.
