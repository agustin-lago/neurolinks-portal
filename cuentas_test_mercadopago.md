# 👥 Cuentas de Prueba (Test Users) - Mercado Pago Sandbox

Este documento contiene el registro oficial de las cuentas de prueba (compradores y vendedor) creadas en tu panel de desarrolladores de Mercado Pago para la aplicación **Pagos-Neurolinks** (`8887282663567774`).

> [!TIP]
> **¿Cómo copiar el usuario completo?**
> Debido a que la interfaz de Mercado Pago trunca los nombres de usuario largos en pantalla (ej. `TESTUSER4619...`), puedes ingresar a tu panel de desarrolladores y copiarlos con un solo clic usando el botón de copiar (📋) al lado de cada usuario:
> 👉 **[Panel de Usuarios de Prueba (Mercado Pago)](https://www.mercadopago.com.ar/developers/panel/app/8887282663567774/test-users)**

---

## 📊 Listado de Cuentas Registradas

| Nombre de la Cuenta | Rol | User ID | Usuario (Email / Nickname) | Contraseña | Código de Verificación |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Comprador Neuro Test Arg1** | 🛒 Comprador | `3404523658` | `TESTUSER3688959288854853262` | `DOnzlO58Tr` | `523658` |
| **Comprador Neuro Test Arg2** | 🛒 Comprador | `3404523660` | `TESTUSER4619...` *(Copiar del Panel)* | `JbRLhvUdqL` | `523660` |
| **Vendedor Neuro Test Arg** | 🏪 Vendedor | `3404523654` | `TESTUSER4574...` *(Copiar del Panel)* | `2RShtcuev0` | `523654` |
| **Comprador Neuro Test Arg3** | 🛒 Comprador | `3404739264` | `TESTUSER3321...` *(Copiar del Panel)* | `AFaXBvgMfp` | `739264` |

---

## 💡 Instrucciones para Pruebas Sandbox

### 1. ¿Cómo iniciar la simulación de compra?
1. Abre tu navegador usando un **Perfil de Invitado (Guest Profile)** en Google Chrome.
2. Ingresa a tu portal en producción (`https://test-neurolinks-portal-production.up.railway.app/`) o local (`http://localhost:3000`).
3. Elige el plan y presiona **"Activar mi portal"**.

### 2. ¿Cómo loguearse en el Checkout?
1. Cuando se abra la pantalla de pago de Mercado Pago, haz clic en **"Ingresar con tu cuenta"** o **"¿Ya tienes una cuenta?"**.
2. Ingresa el **Usuario (Email / Nickname)** de cualquiera de tus compradores de prueba (ej. `TESTUSER3688959288854853262`).
3. Ingresa la **Contraseña** correspondiente (ej. `DOnzlO58Tr`).
4. Si la pasarela te solicita un código de verificación por SMS o email, ingresa el **Código de Verificación** de 6 dígitos que figura en la tabla para esa cuenta (ej. `523658`).

### 3. Realizar el pago simulado
1. Elige pagar con Tarjeta de Crédito.
2. Usa cualquiera de los números de tarjeta de tu archivo [tarjetas_test_mercadopago.md](file:///d:/Dev/Webs/neurolinks-portal/neurolinks-portal/tarjetas_test_mercadopago.md) (ej. Visa APRO: `4509 9535 6623 3704`).
3. El pago se procesará y completará con éxito de inmediato.
